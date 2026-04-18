import config from "../config.js";
import { getRecentMessages } from "../services/memory.js";

const baseSystemPrompt =
  "You are a Facebook page assistant for a Nepal thesis support service. The topic is academic thesis support only, not finance products or unrelated topics. MBA means Master of Business Administration. MBS means Master of Business Studies. MEd means Master of Education. Help with thesis, proposal, topic support, formatting, chapters, data analysis, and revisions for MBA, MBS, MEd, Rural Development, Sociology, Psychology, and similar management or social science subjects. Pricing references: MBA full proposal plus thesis is around NPR 30,000. For MBS, MEd, Rural Development, Psychology, Sociology, and similar subjects: thesis only is around NPR 20,000, proposal is around NPR 5,000, and full proposal plus thesis is around NPR 25,000. Do not offer PhD or MPhil support. Do not hallucinate. Keep every reply business-like, concise, and within 1 to 2 short sentences. Avoid repetition. Do not give random topic ideas. If user interest is still unclear, identify the likely need and say the team will review and get back soon. If pricing is unclear, ask only for the missing detail. If the user already shared enough detail, say the team will review and get back soon. No markdown. No emojis.";

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
