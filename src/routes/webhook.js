import express from "express";
import config from "../config.js";
import { generateReply } from "../services/deepseek.js";
import {
  addAssistantMessage,
  addUserMessage,
  getLanguageStyle,
  setLanguageStyle,
} from "../services/memory.js";
import { sendTextMessage } from "../services/messenger.js";
import { getBestPatternMatch } from "../services/responsePatterns.js";
import { buildPrompt } from "../utils/buildPrompt.js";
import { detectLanguageStyle } from "../utils/detectLanguageStyle.js";
import { extractMessage } from "../utils/extractMessage.js";
import { error, info, warn } from "../utils/logger.js";
import {
  detectUnsupportedService,
  getUnsupportedReply,
} from "../utils/unsupportedService.js";

const router = express.Router();

router.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const verifyToken = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && verifyToken === config.verifyToken) {
    info("Meta webhook verified successfully.");
    return res.status(200).send(challenge);
  }

  warn("Meta webhook verification failed.");
  return res.sendStatus(403);
});

router.post("/webhook", (req, res) => {
  res.sendStatus(200);
  void handleWebhook(req.body);
});

async function handleWebhook(body) {
  try {
    if (body?.object !== "page") {
      warn("Ignored webhook with unsupported object type.", {
        object: body?.object ?? null,
      });
      return;
    }

    const entries = Array.isArray(body.entry) ? body.entry : [];

    for (const entry of entries) {
      const events = Array.isArray(entry.messaging) ? entry.messaging : [];

      for (const event of events) {
        try {
          const extracted = extractMessage(event);

          if (!extracted.shouldReply) {
            info("Skipping event.", { reason: extracted.reason });
            continue;
          }

          const { senderId, text } = extracted;
          const preferredLanguageStyle = getLanguageStyle(senderId);
          const detectedLanguageStyle = detectLanguageStyle(
            text,
            preferredLanguageStyle
          );

          setLanguageStyle(senderId, detectedLanguageStyle);
          addUserMessage(senderId, text, detectedLanguageStyle);

          const unsupportedType = detectUnsupportedService(text);

          if (unsupportedType) {
            const unsupportedReply = getUnsupportedReply(
              unsupportedType,
              detectedLanguageStyle
            );

            await sendTextMessage(senderId, unsupportedReply);
            addAssistantMessage(senderId, unsupportedReply);
            continue;
          }

          const matchedPattern = getBestPatternMatch(text);
          const promptMessages = buildPrompt({
            userId: senderId,
            currentText: text,
            languageStyle: detectedLanguageStyle,
            matchedPatternGuidance: matchedPattern?.guidance ?? null,
          });

          const reply = await generateReply({
            userId: senderId,
            currentText: text,
            languageStyle: detectedLanguageStyle,
            promptMessages,
          });

          await sendTextMessage(senderId, reply);
          addAssistantMessage(senderId, reply);

          info("Sent assistant reply.", {
            senderId,
            languageStyle: detectedLanguageStyle,
            matchedIntent: matchedPattern?.intent ?? null,
          });
        } catch (eventError) {
          error("Failed to process Messenger event.", {
            message: eventError.message,
          });
        }
      }
    }
  } catch (err) {
    error("Unhandled webhook processing error.", {
      message: err.message,
    });
  }
}

export default router;
