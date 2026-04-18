import express from "express";
import config from "../config.js";
import { generateReply } from "../services/deepseek.js";
import { buildDirectReply, isThesisDomainText } from "../services/directReply.js";
import { analyseImage } from "../services/imageAnalysis.js";
import {
  addAssistantMessage,
  addInboundMedia,
  addUserMessage,
  clearHistory,
  getConversationState,
  getLanguageStyle,
  getRecentMessages,
  setConversationState,
  setLanguageStyle,
} from "../services/memory.js";
import {
  getSampleImage,
  listMedia,
  resolveMediaForRequest,
} from "../services/mediaLibrary.js";
import {
  sendImageMessage,
  sendTextAndImage,
  sendTextMessage,
} from "../services/messenger.js";
import { getBestPatternMatch } from "../services/responsePatterns.js";
import { sleep } from "../utils/asyncTools.js";
import { buildPrompt } from "../utils/buildPrompt.js";
import { detectLanguageStyle } from "../utils/detectLanguageStyle.js";
import { detectMediaRequest } from "../utils/mediaRequest.js";
import { extractMessage } from "../utils/extractMessage.js";
import { error, info, warn } from "../utils/logger.js";
import {
  detectUnsupportedService,
  getUnsupportedReply,
} from "../utils/unsupportedService.js";

const duplicateMessageTtlMs = 5 * 60 * 1000;

const errorReplies = {
  english: "Please try again shortly.",
  roman_nepali: "Kripaya ali pachi try garnus.",
  nepali: "Kripaya ali pachi try garnus.",
  mixed: "Kripaya ali pachi try garnus.",
};

const defaultDependencies = {
  config,
  generateReply,
  buildDirectReply,
  isThesisDomainText,
  analyseImage,
  addAssistantMessage,
  addInboundMedia,
  addUserMessage,
  clearHistory,
  getConversationState,
  getLanguageStyle,
  getRecentMessages,
  setConversationState,
  setLanguageStyle,
  getSampleImage,
  listMedia,
  resolveMediaForRequest,
  sendImageMessage,
  sendTextAndImage,
  sendTextMessage,
  getBestPatternMatch,
  sleep,
  buildPrompt,
  detectLanguageStyle,
  detectMediaRequest,
  extractMessage,
  error,
  info,
  warn,
  detectUnsupportedService,
  getUnsupportedReply,
};

function getAllMediaReply(languageStyle) {
  const replies = {
    english: "Here are all the available images.",
    roman_nepali: "Yaha sabai available images chhan.",
    nepali: "Yaha sabai available images chhan.",
    mixed: "Yaha sabai available images chhan.",
  };

  return replies[languageStyle] || replies.english;
}

function resolvePublicBaseUrl(req, configuredBaseUrl) {
  if (configuredBaseUrl) {
    return configuredBaseUrl.replace(/\/+$/, "");
  }

  const host = req.get("host");

  if (!host) {
    return null;
  }

  const forwardedProto = req.get("x-forwarded-proto");
  const protocol = forwardedProto?.split(",")[0]?.trim() || req.protocol || "https";

  return `${protocol}://${host}`;
}

function getErrorReply(languageStyle) {
  return errorReplies[languageStyle] || errorReplies.english;
}

function isConversationResetGreeting(text) {
  const normalized = String(text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  return ["hello", "hi", "hey", "hy", "namaste", "namaskar"].includes(normalized);
}

function createProcessingState() {
  return {
    processedMessageIds: new Map(),
    senderQueues: new Map(),
    senderLastProcessedAt: new Map(),
  };
}

export function createWebhookRouter(overrides = {}) {
  const deps = {
    ...defaultDependencies,
    ...overrides,
  };
  const state = overrides.processingState || createProcessingState();
  const router = express.Router();

  function markDuplicateMessage(messageId) {
    if (!messageId) {
      return false;
    }

    const now = Date.now();

    for (const [storedId, storedAt] of state.processedMessageIds.entries()) {
      if (now - storedAt > duplicateMessageTtlMs) {
        state.processedMessageIds.delete(storedId);
      }
    }

    if (state.processedMessageIds.has(messageId)) {
      return true;
    }

    state.processedMessageIds.set(messageId, now);
    return false;
  }

  function queueSenderEvent(senderId, task) {
    const previous = state.senderQueues.get(senderId) || Promise.resolve();
    const queued = previous
      .catch(() => undefined)
      .then(async () => {
        const lastProcessedAt = state.senderLastProcessedAt.get(senderId) || 0;
        const waitMs = Math.max(
          0,
          deps.config.webhookDebounceMs - (Date.now() - lastProcessedAt)
        );

        if (waitMs > 0) {
          await deps.sleep(waitMs);
        }

        await task();
        state.senderLastProcessedAt.set(senderId, Date.now());
      })
      .finally(() => {
        if (state.senderQueues.get(senderId) === queued) {
          state.senderQueues.delete(senderId);
        }
      });

    state.senderQueues.set(senderId, queued);
    return queued;
  }

  async function safeSendText(senderId, text) {
    try {
      await deps.sendTextMessage(senderId, text);
    } catch (_sendError) {
      // Messenger service already logs the minimal failure details.
    }
  }

  async function processMessengerEvent(extracted, requestContext = {}) {
    const previousLanguageStyle = deps.getLanguageStyle(extracted.senderId);
    const detectedLanguageStyle = extracted.text
      ? deps.detectLanguageStyle(extracted.text, previousLanguageStyle)
      : previousLanguageStyle || "english";

    if (
      extracted.text &&
      isConversationResetGreeting(extracted.text) &&
      deps.getRecentMessages(extracted.senderId, 2).length > 0
    ) {
      deps.clearHistory(extracted.senderId);
    }

    deps.setLanguageStyle(extracted.senderId, detectedLanguageStyle);

    try {
      if (extracted.text) {
        deps.addUserMessage(
          extracted.senderId,
          extracted.text,
          detectedLanguageStyle
        );
      }

      if (extracted.images.length > 0) {
        for (const image of extracted.images) {
          deps.addInboundMedia(extracted.senderId, {
            direction: "inbound",
            type: "image",
            url: image.url,
            createdAt: new Date().toISOString(),
          });
        }

        const analysis = await deps.analyseImage({
          imageUrl: extracted.images[0].url,
          userText: extracted.text,
          languageStyle: detectedLanguageStyle,
        });

        await deps.sendTextMessage(extracted.senderId, analysis.reply);
        deps.addAssistantMessage(extracted.senderId, analysis.reply);

        deps.info("Processed message.", {
          messageType: "image",
          languageDetected: detectedLanguageStyle,
          intentDetected: "image_received",
        });
        return;
      }

      const matchedPattern = deps.getBestPatternMatch(extracted.text);
      const recentMessages = deps.getRecentMessages(
        extracted.senderId,
        deps.config.maxMemoryMessages
      );
      const conversationState = deps.getConversationState(extracted.senderId);
      const resolvedMedia = deps.resolveMediaForRequest({
        text: extracted.text,
        matchedIntent: matchedPattern?.intent ?? null,
        publicBaseUrl: requestContext.publicBaseUrl,
      });
      const mediaRequest = deps.detectMediaRequest(extracted.text);

      if (mediaRequest.type === "all") {
        const allMedia = deps
          .listMedia(requestContext.publicBaseUrl)
          .filter((item) => item?.url);

        if (allMedia.length === 0) {
          const fallbackReply =
            detectedLanguageStyle === "english"
              ? "We will share the images soon."
              : "Images chittai share garchhau.";

          await deps.sendTextMessage(extracted.senderId, fallbackReply);
          deps.addAssistantMessage(extracted.senderId, fallbackReply);
        } else {
          const introReply = getAllMediaReply(detectedLanguageStyle);
          const [firstMedia, ...remainingMedia] = allMedia;

          await deps.sendTextAndImage(
            extracted.senderId,
            introReply,
            firstMedia.url
          );
          deps.addAssistantMessage(extracted.senderId, introReply);

          for (const media of remainingMedia) {
            await deps.sendImageMessage(extracted.senderId, media.url);
            await deps.sleep(150);
          }
        }

        deps.info("Processed message.", {
          messageType: "text",
          languageDetected: detectedLanguageStyle,
          intentDetected: "all_media",
        });
        return;
      }

      if (mediaRequest.type === "single") {
        const media = resolvedMedia || deps.getSampleImage(requestContext.publicBaseUrl);

        if (!media?.url) {
          const fallbackReply =
            detectedLanguageStyle === "english"
              ? "We will share a sample soon."
              : "Sample chittai share garchhau.";

          await deps.sendTextMessage(extracted.senderId, fallbackReply);
          deps.addAssistantMessage(extracted.senderId, fallbackReply);
        } else {
          const caption =
            media.caption?.[detectedLanguageStyle] ||
            media.caption?.roman_nepali ||
            media.caption?.english ||
            "Sample image.";

          await deps.sendTextAndImage(extracted.senderId, caption, media.url);
          deps.addAssistantMessage(extracted.senderId, caption);
        }

        deps.info("Processed message.", {
          messageType: "text",
          languageDetected: detectedLanguageStyle,
          intentDetected: media?.key || "sample_image",
        });
        return;
      }

      const unsupportedType = deps.detectUnsupportedService(extracted.text);

      if (unsupportedType) {
        const unsupportedReply = deps.getUnsupportedReply(
          unsupportedType,
          detectedLanguageStyle
        );

        await deps.sendTextMessage(extracted.senderId, unsupportedReply);
        deps.addAssistantMessage(extracted.senderId, unsupportedReply);

        deps.info("Processed message.", {
          messageType: "text",
          languageDetected: detectedLanguageStyle,
          intentDetected: unsupportedType,
        });
        return;
      }

      const directResult = deps.buildDirectReply({
        text: extracted.text,
        languageStyle: detectedLanguageStyle,
        matchedPattern,
        recentMessages,
        conversationState,
      });

      const directReply =
        typeof directResult === "string" ? { reply: directResult } : directResult;

      if (directReply?.conversationState) {
        deps.setConversationState(extracted.senderId, directReply.conversationState);
      }

      if (directReply?.reply) {
        await deps.sendTextMessage(extracted.senderId, directReply.reply);
        deps.addAssistantMessage(extracted.senderId, directReply.reply);

        deps.info("Processed message.", {
          messageType: "text",
          languageDetected: detectedLanguageStyle,
          intentDetected: matchedPattern?.intent ?? "direct_reply",
        });
        return;
      }

      if (!deps.isThesisDomainText({ text: extracted.text, matchedPattern })) {
        deps.info("Processed message.", {
          messageType: "text",
          languageDetected: detectedLanguageStyle,
          intentDetected: "ignored_non_domain",
        });
        return;
      }

      const promptMessages = deps.buildPrompt({
        userId: extracted.senderId,
        currentText: extracted.text,
        languageStyle: detectedLanguageStyle,
        matchedPatternGuidance: matchedPattern?.guidance ?? null,
      });

      const reply = await deps.generateReply({
        currentText: extracted.text,
        languageStyle: detectedLanguageStyle,
        promptMessages,
      });

      if (!reply) {
        deps.info("Processed message.", {
          messageType: "text",
          languageDetected: detectedLanguageStyle,
          intentDetected: matchedPattern?.intent ?? "suppressed_reply",
        });
        return;
      }

      await deps.sendTextMessage(extracted.senderId, reply);
      deps.addAssistantMessage(extracted.senderId, reply);

      deps.info("Processed message.", {
        messageType: "text",
        languageDetected: detectedLanguageStyle,
        intentDetected: matchedPattern?.intent ?? "general_text",
      });
    } catch (eventError) {
      deps.error("Failed to process Messenger event.", {
        stage: "event_processing",
        detail: eventError.message,
        messageType: extracted.messageType,
        languageDetected: detectedLanguageStyle,
        intentDetected: "error",
      });

      await safeSendText(extracted.senderId, getErrorReply(detectedLanguageStyle));
    }
  }

  async function handleWebhook(body, requestContext = {}) {
    try {
      if (body?.object !== "page") {
        deps.warn("Ignored webhook with unsupported object type.", {
          messageType: "unsupported",
          languageDetected: null,
          intentDetected: "ignored_object",
        });
        return;
      }

      const entries = Array.isArray(body.entry) ? body.entry : [];

      for (const entry of entries) {
        const events = Array.isArray(entry.messaging) ? entry.messaging : [];

        for (const event of events) {
          const extracted = deps.extractMessage(event);

          if (!extracted.shouldReply) {
            continue;
          }

          if (markDuplicateMessage(extracted.messageId)) {
            deps.info("Processed message.", {
              messageType: extracted.messageType,
              languageDetected: null,
              intentDetected: "duplicate_ignored",
            });
            continue;
          }

          void queueSenderEvent(extracted.senderId, () =>
            processMessengerEvent(extracted, requestContext)
          );
        }
      }
    } catch (err) {
      deps.error("Unhandled webhook processing error.", {
        stage: "webhook",
        detail: err.message,
        messageType: "unknown",
        languageDetected: null,
        intentDetected: "webhook_error",
      });
    }
  }

  router.get("/", (_req, res) => {
    res.status(200).send("Bot running");
  });

  router.get("/webhook", (req, res) => {
    const mode = req.query["hub.mode"];
    const verifyToken = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && verifyToken === deps.config.verifyToken) {
      deps.info("Meta webhook verified successfully.");
      return res.status(200).send(challenge);
    }

    deps.warn("Meta webhook verification failed.");
    return res.sendStatus(403);
  });

  router.post("/webhook", (req, res) => {
    res.sendStatus(200);
    void handleWebhook(req.body, {
      publicBaseUrl: resolvePublicBaseUrl(req, deps.config.publicBaseUrl),
    });
  });

  return router;
}

const webhookRouter = createWebhookRouter();

export default webhookRouter;
