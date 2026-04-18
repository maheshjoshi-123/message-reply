const devanagariRegex = /[\u0900-\u097F]/u;

const romanNepaliKeywords = [
  "huncha",
  "hunxa",
  "tapaiko",
  "tapai",
  "tapailai",
  "kina",
  "kun",
  "kasari",
  "cha",
  "chha",
  "ho",
  "bhayo",
  "garchha",
  "garcha",
  "pathaunu",
  "bhane",
  "milcha",
  "sodhnu",
];

const englishMarkers = [
  "hello",
  "price",
  "proposal",
  "thesis",
  "topic",
  "deadline",
  "service",
  "sample",
  "image",
  "photo",
  "support",
  "help",
];

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function detectLanguageStyle(text, previousStyle = "english") {
  const normalized = normalize(text);

  if (!normalized) {
    return previousStyle;
  }

  const hasDevanagari = devanagariRegex.test(text);
  const words = normalized.split(" ").filter(Boolean);
  const romanNepaliHits = words.filter((word) =>
    romanNepaliKeywords.includes(word)
  ).length;
  const englishHits = words.filter((word) => englishMarkers.includes(word)).length;
  const englishRatio = words.length > 0 ? englishHits / words.length : 0;

  if (hasDevanagari && (romanNepaliHits > 0 || englishHits > 0)) {
    return "mixed";
  }

  if (hasDevanagari) {
    return "nepali";
  }

  if (
    normalized.includes("english audaina") ||
    normalized.includes("english aaudaina") ||
    normalized.includes("english bujdina")
  ) {
    return "roman_nepali";
  }

  if (romanNepaliHits >= 2) {
    return englishHits >= 2 ? "mixed" : "roman_nepali";
  }

  if (romanNepaliHits >= 1 && englishHits >= 1) {
    return "mixed";
  }

  if (romanNepaliHits >= 1) {
    return "roman_nepali";
  }

  if (englishHits >= 2 || (englishRatio >= 0.45 && words.length >= 3)) {
    return "english";
  }

  if (previousStyle === "english" && englishHits >= 1) {
    return "english";
  }

  return previousStyle === "roman_nepali" || previousStyle === "nepali"
    ? previousStyle
    : "english";
}
