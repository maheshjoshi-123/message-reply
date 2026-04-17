import OpenAI from "openai";
import config from "../config.js";
import { info, error } from "../utils/logger.js";

const client = new OpenAI({
  apiKey: config.deepseekApiKey,
  baseURL: `${config.deepseekBaseUrl.replace(/\/+$/, "")}/v1`,
});

const fallbackReplies = {
  english: "Thanks for your message. Our team will get back to you shortly.",
  nepali_devanagari:
    "तपाईंको सन्देशका लागि धन्यवाद। हाम्रो team ले छिट्टै तपाईंलाई reply गर्नेछ।",
  roman_nepali:
    "Tapai ko message ko lagi dhanyabad. Hamro team chadai tapailai reply garchha.",
  mixed:
    "Message ko lagi dhanyabad. Hamro team le chadai tapailai reply garchha.",
};

export function getFallbackReply(languageStyle) {
  return fallbackReplies[languageStyle] || fallbackReplies.english;
}

export async function generateReply({
  userId,
  currentText,
  languageStyle,
  promptMessages,
}) {
  try {
    info("Generating DeepSeek reply.", {
      userId,
      languageStyle,
    });

    const completion = await client.chat.completions.create({
      model: config.deepseekModel,
      temperature: config.modelTemperature,
      max_tokens: config.modelMaxTokens,
      messages: promptMessages,
    });

    const reply = completion.choices?.[0]?.message?.content?.trim();

    if (!reply) {
      info("DeepSeek returned empty content. Using fallback reply.", {
        userId,
      });
      return getFallbackReply(languageStyle);
    }

    return reply.replace(/\s+/g, " ").trim();
  } catch (err) {
    error("DeepSeek request failed.", {
      userId,
      message: err.message,
      status: err.status ?? err.response?.status ?? null,
      currentTextPreview: currentText.slice(0, 80),
    });
    return getFallbackReply(languageStyle);
  }
}
