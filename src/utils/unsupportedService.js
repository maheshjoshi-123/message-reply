function normalize(text) {
  return String(text || "").toLowerCase();
}

export function detectUnsupportedService(text) {
  const normalized = normalize(text);

  const phdMphilKeywords = ["phd", "mphil", "पीएचडी", "एमफिल"];

  const engineeringKeywords = [
    "civil engineering",
    "mechanical engineering",
    "engineering thesis",
    "engineering ko thesis",
    "engineering",
    "सिभिल",
    "मेकानिकल",
    "इन्जिनियरिङ",
  ];

  if (phdMphilKeywords.some((keyword) => normalized.includes(keyword.toLowerCase()))) {
    return "phd_mphil";
  }

  if (
    engineeringKeywords.some((keyword) => normalized.includes(keyword.toLowerCase()))
  ) {
    return "engineering";
  }

  return null;
}

const unsupportedReplies = {
  phd_mphil: {
    english: "Sorry, we do not provide PhD or MPhil thesis support.",
    roman_nepali: "Sorry, hami PhD wa MPhil ko thesis support gardainau.",
    nepali: "Sorry, hami PhD wa MPhil ko thesis support gardainau.",
    mixed: "Sorry, hami PhD wa MPhil ko thesis support gardainau.",
  },
  engineering: {
    english: "Sorry, we generally do not provide engineering thesis support.",
    roman_nepali: "Sorry, hami generally engineering thesis support gardainau.",
    nepali: "Sorry, hami generally engineering thesis support gardainau.",
    mixed: "Sorry, hami generally engineering thesis support gardainau.",
  },
};

export function getUnsupportedReply(type, languageStyle) {
  return (
    unsupportedReplies[type]?.[languageStyle] ||
    unsupportedReplies[type]?.english ||
    "Sorry, we cannot help with that service."
  );
}
