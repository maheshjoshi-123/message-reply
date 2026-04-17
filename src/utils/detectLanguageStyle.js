const devanagariRegex = /[\u0900-\u097F]/u;

const romanNepaliWords = [
  "malai",
  "maile",
  "kati",
  "ho",
  "ko",
  "chha",
  "cha",
  "huncha",
  "hunxa",
  "hudaina",
  "hudena",
  "milcha",
  "milxa",
  "bhanchha",
  "bhanne",
  "kina",
  "kata",
  "chaincha",
  "chahinchha",
  "chahiyo",
  "garne",
  "garnu",
  "gardinuhunchha",
  "ra",
  "pani",
  "kun",
  "bhayo",
  "vayo",
  "chhito",
  "matra",
  "tapai",
  "tapailai",
  "dinuhunchha",
  "kahile",
  "samma",
  "bhaye",
  "dubai",
  "audaina",
  "parchha",
  "matrai",
  "milako",
  "bahira",
  "samma",
  "lahi",
  "dinu",
];

const englishServiceWords = [
  "price",
  "proposal",
  "thesis",
  "subject",
  "deadline",
  "topic",
  "formatting",
  "chapter",
  "supervisor",
  "correction",
  "data",
  "analysis",
  "mba",
  "phd",
  "mphil",
];

function normalize(text) {
  return text
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

  if (devanagariRegex.test(text)) {
    return "nepali_devanagari";
  }

  const words = normalized.split(" ");
  const romanHits = words.filter((word) => romanNepaliWords.includes(word)).length;
  const englishHits = words.filter((word) =>
    englishServiceWords.includes(word)
  ).length;

  if (
    normalized.includes("english audaina") ||
    normalized.includes("english aaudaina")
  ) {
    return "roman_nepali";
  }

  if (romanHits >= 3) {
    return "roman_nepali";
  }

  if (romanHits >= 2 && englishHits >= 1) {
    return "mixed";
  }

  if (romanHits >= 1 && englishHits >= 2) {
    return "mixed";
  }

  if (romanHits >= 1) {
    return "roman_nepali";
  }

  return "english";
}
