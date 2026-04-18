import OpenAI from "openai";
import config from "../config.js";
import { withRetries, withTimeout } from "../utils/asyncTools.js";
import { error, warn } from "../utils/logger.js";

const deepseekClient = new OpenAI({
  apiKey: config.deepseekApiKey,
  baseURL: `${config.deepseekBaseUrl.replace(/\/+$/, "")}/v1`,
});

const timeoutSentinel = Symbol("ai-timeout");
const devanagariRegex = /[\u0900-\u097F]/u;
const blockedReplyPhrases = [
  "i will confirm and get back to you",
  "our team will review and get back",
  "our team will review",
  "ma sir lai sodhera bhanxu",
  "hamro team le herera",
  "chittai reply garchha",
  "get back shortly",
];
const hindiToNepalStyleReplacements = [
  [/\baapko\b/giu, "tapailai"],
  [/\baap\b/giu, "tapai"],
  [/\bhaisakyo\b/giu, "bhaisakyo"],
  [/\bkar sakte\b/giu, "garna sakchha"],
];

function normalizeReply(reply, fallbackLanguageStyle) {
  const clean = String(reply || "").replace(/\s+/g, " ").trim();

  if (!clean) {
    return null;
  }

  const sentences = clean
    .split(/(?<=[.!?à¥¤])\s+/u)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2);

  const compact = (sentences.join(" ") || clean).trim();
  const normalizedCompact = compact.toLowerCase();

  if (blockedReplyPhrases.some((phrase) => normalizedCompact.includes(phrase))) {
    return null;
  }

  if (
    (fallbackLanguageStyle === "roman_nepali" ||
      fallbackLanguageStyle === "mixed") &&
    devanagariRegex.test(compact)
  ) {
    return null;
  }

  if (fallbackLanguageStyle === "nepali" && devanagariRegex.test(compact)) {
    return null;
  }

  if (fallbackLanguageStyle === "roman_nepali" || fallbackLanguageStyle === "mixed") {
    return hindiToNepalStyleReplacements
      .reduce(
        (output, [pattern, replacement]) => output.replace(pattern, replacement),
        compact
      )
      .trim();
  }

  return compact;
}

export function buildGeminiRequestPayload(promptMessages = []) {
  const systemInstruction = promptMessages.find(
    (message) => message?.role === "system" && message?.content
  )?.content;
  const contents = promptMessages
    .filter((message) => message?.role !== "system" && message?.content)
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: String(message.content).trim() }],
    }))
    .filter((message) => message.parts[0].text);

  const payload = {
    contents,
    generationConfig: {
      temperature: config.modelTemperature,
      maxOutputTokens: config.modelMaxTokens,
      responseMimeType: "text/plain",
    },
  };

  if (systemInstruction) {
    payload.system_instruction = {
      parts: [{ text: String(systemInstruction).trim() }],
    };
  }

  return payload;
}

export function extractGeminiReplyText(responseBody) {
  const parts = responseBody?.candidates?.[0]?.content?.parts;

  if (!Array.isArray(parts)) {
    return "";
  }

  return parts
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join(" ")
    .trim();
}

function createGeminiError({ status, bodyText, bodyJson }) {
  const errorMessage =
    bodyJson?.error?.message || bodyText || `Gemini request failed with status ${status}.`;
  const requestError = new Error(errorMessage);

  requestError.provider = "gemini";
  requestError.status = status;
  requestError.body = bodyJson || bodyText || null;

  return requestError;
}

function parseJsonSafely(text) {
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

export function isGeminiQuotaExhausted(err) {
  const status = Number(err?.status);
  const body = err?.body;
  const jsonText = body && typeof body === "object" ? JSON.stringify(body) : "";
  const rawMessage = [
    err?.message,
    body?.error?.message,
    body?.error?.status,
    jsonText,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (status === 429) {
    return (
      rawMessage.includes("resource_exhausted") ||
      rawMessage.includes("quota") ||
      rawMessage.includes("rate limit") ||
      rawMessage.includes("rate limits") ||
      rawMessage.includes("exceeded your current quota") ||
      rawMessage.includes("resource has been exhausted")
    );
  }

  return false;
}

async function requestGemini({
  promptMessages,
  languageStyle,
  fetchImpl = fetch,
}) {
  const payload = buildGeminiRequestPayload(promptMessages);

  if (!payload.contents.length) {
    return null;
  }

  const response = await withTimeout(
    () =>
      fetchImpl(
        `${config.geminiBaseUrl.replace(/\/+$/, "")}/models/${config.geminiModel}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": config.geminiApiKey,
          },
          body: JSON.stringify(payload),
        }
      ),
    config.requestTimeoutMs,
    () => {
      warn("Gemini request timed out.", {
        provider: "gemini",
        messageType: "text",
        languageDetected: languageStyle,
        intentDetected: "timeout_fallback",
      });
      return timeoutSentinel;
    }
  );

  if (response === timeoutSentinel) {
    const timeoutError = new Error("Gemini request timed out.");
    timeoutError.code = "AI_TIMEOUT";
    timeoutError.provider = "gemini";
    throw timeoutError;
  }

  const rawBody = await response.text();
  const parsedBody = parseJsonSafely(rawBody);

  if (!response.ok) {
    throw createGeminiError({
      status: response.status,
      bodyText: rawBody,
      bodyJson: parsedBody,
    });
  }

  return normalizeReply(extractGeminiReplyText(parsedBody), languageStyle);
}

async function requestDeepSeek({
  promptMessages,
  languageStyle,
  deepseekRequest = (messages) =>
    deepseekClient.chat.completions.create({
      model: config.deepseekModel,
      temperature: config.modelTemperature,
      max_tokens: config.modelMaxTokens,
      messages,
    }),
}) {
  const completion = await withTimeout(
    () =>
      withRetries(
        () => deepseekRequest(promptMessages),
        {
          retries: config.retryCount,
          retryDelayMs: 300,
        }
      ),
    config.requestTimeoutMs,
    () => {
      warn("DeepSeek request timed out.", {
        provider: "deepseek",
        messageType: "text",
        languageDetected: languageStyle,
        intentDetected: "timeout_fallback",
      });
      return timeoutSentinel;
    }
  );

  if (completion === timeoutSentinel) {
    const timeoutError = new Error("DeepSeek request timed out.");
    timeoutError.code = "AI_TIMEOUT";
    timeoutError.provider = "deepseek";
    throw timeoutError;
  }

  const reply = completion?.choices?.[0]?.message?.content;
  return normalizeReply(reply, languageStyle);
}

function shouldUseGemini() {
  return Boolean(config.geminiApiKey);
}

export async function generateReply({
  currentText,
  languageStyle,
  promptMessages,
  fetchImpl = fetch,
  deepseekRequest,
}) {
  try {
    if (shouldUseGemini()) {
      try {
        return await requestGemini({
          promptMessages,
          languageStyle,
          fetchImpl,
        });
      } catch (err) {
        if (isGeminiQuotaExhausted(err)) {
          warn("Gemini quota exhausted. Falling back to DeepSeek.", {
            provider: "gemini",
            fallbackProvider: "deepseek",
            status: err.status ?? null,
            messageType: "text",
            languageDetected: languageStyle,
            intentDetected: "quota_fallback",
          });

          return await requestDeepSeek({
            promptMessages,
            languageStyle,
            deepseekRequest,
          });
        }

        error("AI request failed.", {
          provider: "gemini",
          stage: "generate_reply",
          status: err.status ?? err.response?.status ?? null,
          detail: err.message,
          messageType: "text",
          languageDetected: languageStyle,
          intentDetected: "error_fallback",
        });

        throw err;
      }
    }

    return await requestDeepSeek({
      promptMessages,
      languageStyle,
      deepseekRequest,
    });
  } catch (err) {
    if (err?.provider !== "gemini") {
      error("AI request failed.", {
        provider: err?.provider || "deepseek",
        stage: "generate_reply",
        status: err.status ?? err.response?.status ?? null,
        detail: err.message,
        messageType: "text",
        languageDetected: languageStyle,
        intentDetected: "error_fallback",
      });
    }

    throw err;
  }
}
