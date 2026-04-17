import { getHistory } from "../services/memory.js";

const SYSTEM_PROMPT =
  "You are a Facebook page assistant for a thesis support service. You help with thesis and research support for MBA, MBS, MEd, Rural Development, Sociology, Psychology, and similar social science or management subjects. You generally do not provide engineering thesis support such as civil or mechanical engineering. You do not provide PhD or MPhil support. Services may include proposal, full thesis, topic support, formatting, chapter-wise help, Chapter 4 and 5, data analysis, and revisions based on supervisor feedback. Users may bring their own topic, or topic support can be provided. Pricing guidance: MBA full proposal + thesis is around NPR 30,000. For MBS, MEd, Rural Development, Psychology, Sociology, and similar subjects: thesis only is around NPR 20,000, proposal is around NPR 5,000, and full proposal + thesis is around NPR 25,000. If exact scope is unclear, ask for more information and say the team will get back to the user. If the user already shared details and asks again, say the team needs a little more time and will get back to the user. Reply in the user's language style. Keep replies short, clear, business-like, and conversational. Keep most replies within 1 to 3 short sentences. Ask only one useful follow-up question at a time. Do not invent unsupported services, exact timelines, or guarantees. If something is uncertain, say a supervisor or senior will confirm and get back to the user. Do not use markdown or emojis.";

const languageInstructions = {
  english: "Reply in simple English.",
  nepali_devanagari:
    "Reply in simple conversational Nepali. Use everyday wording, not formal literary Nepali.",
  roman_nepali:
    "Reply in simple conversational Roman Nepali. Use everyday Nepal-style words like huncha, hudaina, kun, kina, kata, ho, chha, tapai, tapailai when natural. Do not switch to full English. Avoid Hindi-style wording.",
  mixed:
    "Reply in natural mixed Nepali-English, but lean toward conversational Nepal-style wording. Use short everyday phrases like huncha, hudaina, kun, kina, kata, milcha, tapai, tapailai when natural. Do not reply in full formal English. Avoid Hindi-style wording.",
};

function compactText(text, limit = 400) {
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
  const history = getHistory(userId);
  const messages = [
    {
      role: "system",
      content: `${SYSTEM_PROMPT} ${languageInstructions[languageStyle] || languageInstructions.english}`,
    },
  ];

  if (matchedPatternGuidance) {
    messages.push({
      role: "system",
      content: `Pattern guidance: ${compactText(matchedPatternGuidance, 220)}`,
    });
  }

  const compactHistory = history.slice(-8).map((message) => ({
    role: message.role,
    content: compactText(message.content, 240),
  }));

  messages.push(...compactHistory);

  const lastMessage = messages[messages.length - 1];
  const currentCompact = compactText(currentText, 400);

  if (
    !lastMessage ||
    lastMessage.role !== "user" ||
    lastMessage.content !== currentCompact
  ) {
    messages.push({
      role: "user",
      content: currentCompact,
    });
  }

  return messages;
}
