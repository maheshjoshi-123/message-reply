import config from "../config.js";
import { getRecentMessages } from "../services/memory.js";

const baseSystemPrompt =
  "You are a Facebook page assistant for a Nepal thesis support service. Reply only about thesis, proposal, topic, formatting, data analysis, chapter, viva, correction, or revision support for masters-level management and social science subjects. Your goal is to understand the student's need and move the conversation toward taking service from us. Keep every reply concise, business-like, and within 1 to 2 short sentences. Ask at most one useful follow-up question. Do not hallucinate. Do not give random topic ideas. Do not mention images unless the user explicitly asked for an image. If the message is unclear, outside scope, or you are not confident, return an empty response. No markdown. No emojis.";

const languageInstructions = {
  english: "Reply in simple English only when the user is clearly using English.",
  roman_nepali:
    "Reply in concise Roman Nepali only. Do not use Devanagari script. Prefer Nepal-style wording like huncha, tapai, kasari, kun, chha, ho when natural.",
  nepali:
    "Reply in concise Roman Nepali by default. Do not switch to Devanagari unless the user explicitly asks for Nepali script.",
  mixed:
    "Mirror the user's mixed style, but keep it concise and lean toward Roman Nepali. Avoid full Devanagari replies. Use at least one natural Nepal-style phrase such as tapai, huncha, chha, milcha, or kati when appropriate.",
};

function compactText(text, limit = 220) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();

  if (clean.length <= limit) {
    return clean;
  }

  return `${clean.slice(0, limit - 3).trim()}...`;
}

export function buildPrompt({
  userId,
  currentText,
  languageStyle,
  matchedPatternGuidance,
}) {
  const history = getRecentMessages(userId, config.maxMemoryMessages).map(
    (message) => ({
      role: message.role,
      content: compactText(message.content, 180),
    })
  );

  const systemSections = [
    baseSystemPrompt,
    languageInstructions[languageStyle] || languageInstructions.english,
  ];

  if (matchedPatternGuidance) {
    systemSections.push(`Intent guidance: ${compactText(matchedPatternGuidance, 140)}`);
  }

  const currentCompact = compactText(currentText, 220);
  const lastHistoryMessage = history[history.length - 1];
  const messages = [
    {
      role: "system",
      content: systemSections.join(" "),
    },
    ...history,
  ];

  if (
    !lastHistoryMessage ||
    lastHistoryMessage.role !== "user" ||
    lastHistoryMessage.content !== currentCompact
  ) {
    messages.push({
      role: "user",
      content: currentCompact,
    });
  }

  return messages;
}
