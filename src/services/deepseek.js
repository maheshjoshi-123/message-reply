import OpenAI from "openai";
import config from "../config.js";
import { withRetries, withTimeout } from "../utils/asyncTools.js";
import { error, warn } from "../utils/logger.js";

const client = new OpenAI({
  apiKey: config.deepseekApiKey,
  baseURL: `${config.deepseekBaseUrl.replace(/\/+$/, "")}/v1`,
});

const fallbackReplies = {
  english: "Thanks for your message. Our team will review and get back shortly.",
  roman_nepali:
    "Tapai ko message ko lagi dhanyabad. Hamro team le herera chittai reply garchha.",
  nepali:
    "Tapai ko sandesh ko lagi dhanyabad. Hamro team le herera chittai reply garchha.",
  mixed: "Message ko lagi dhanyabad. Hamro team le herera chittai reply garchha.",
};

const devanagariRegex = /[\u0900-\u097F]/u;
const hindiToNepalStyleReplacements = [
  [/\baapko\b/giu, "tapailai"],
  [/\baap\b/giu, "tapai"],
  [/\bhaisakyo\b/giu, "bhaisakyo"],
  [/\bkar sakte\b/giu, "garna sakchha"],
];

export function getFallbackReply(languageStyle) {
  return fallbackReplies[languageStyle] || fallbackReplies.english;
}

function normalizeReply(reply, fallbackLanguageStyle) {
  const clean = String(reply || "").replace(/\s+/g, " ").trim();

  if (!clean) {
    return getFallbackReply(fallbackLanguageStyle);
  }

  const sentences = clean
    .split(/(?<=[.!?।])\s+/u)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2);

  const compact = (sentences.join(" ") || clean).trim();

  if (
    (fallbackLanguageStyle === "roman_nepali" ||
      fallbackLanguageStyle === "mixed") &&
    devanagariRegex.test(compact)
  ) {
    return getFallbackReply(fallbackLanguageStyle);
  }

  if (fallbackLanguageStyle === "nepali" && devanagariRegex.test(compact)) {
    return getFallbackReply(fallbackLanguageStyle);
  }

  if (fallbackLanguageStyle === "roman_nepali" || fallbackLanguageStyle === "mixed") {
    return hindiToNepalStyleReplacements.reduce(
      (output, [pattern, replacement]) => output.replace(pattern, replacement),
      compact
    );
  }

  return compact;
}

export async function generateReply({
  currentText,
  languageStyle,
  promptMessages,
}) {
  try {
    const completion = await withTimeout(
      () =>
        withRetries(
          () =>
            client.chat.completions.create({
              model: config.deepseekModel,
              temperature: config.modelTemperature,
              max_tokens: config.modelMaxTokens,
              messages: promptMessages,
            }),
          {
            retries: config.retryCount,
            retryDelayMs: 300,
          }
        ),
      config.requestTimeoutMs,
      () => {
        warn("AI request timed out.", {
          messageType: "text",
          languageDetected: languageStyle,
          intentDetected: "timeout_fallback",
        });
        return null;
      }
    );

    const reply = completion?.choices?.[0]?.message?.content;
    return normalizeReply(reply, languageStyle);
  } catch (err) {
    error("AI request failed.", {
      stage: "generate_reply",
      status: err.status ?? err.response?.status ?? null,
      detail: err.message,
      messageType: "text",
      languageDetected: languageStyle,
      intentDetected: "error_fallback",
    });

    return currentText ? getFallbackReply(languageStyle) : getFallbackReply("english");
  }
}
