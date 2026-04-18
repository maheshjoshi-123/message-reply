const imageNouns = [
  "pic",
  "photo",
  "photos",
  "image",
  "images",
  "poster",
  "posters",
  "banner",
  "banners",
  "sample pic",
  "sample photo",
  "sample image",
  "sample poster",
  "sample banner",
];

const requestWords = [
  "send",
  "show",
  "share",
  "pathaunu",
  "pathau",
  "pathaidinu",
  "pathaideu",
  "dekhau",
  "deu",
  "deuna",
  "dinu",
  "dinus",
  "provide",
];

const allMediaPhrases = [
  "all photos that you have",
  "all images that you have",
  "all posters that you have",
  "all banners that you have",
  "all photos",
  "all images",
  "all posters",
  "all banners",
  "all pics",
  "all pic",
  "sabai photo",
  "sabai photos",
  "sabai image",
  "sabai images",
  "sabai poster",
  "sabai posters",
  "sabai banner",
  "sabai banners",
];

const questionWords = [
  "what",
  "why",
  "how",
  "kina",
  "kasari",
  "k",
  "ke",
  "cha",
  "chha",
  "huncha",
  "available",
];

const imageStopPhrases = [
  "send nagari",
  "photo send nagari",
  "image send nagari",
  "picture send nagari",
  "photo chaina",
  "image chaina",
  "pic chaina",
  "poster chaina",
  "banner chaina",
  "send garnu pardaina",
  "send garnu parena",
  "send garnu hudaina",
  "pathaunu pardaina",
  "pathaunu hudaina",
  "send nagarnu",
  "pathaunu nagarnu",
  "dont send photo",
  "do not send photo",
  "dont send image",
  "do not send image",
  "no photo",
  "no image",
];

const imageComplaintPhrases = [
  "kina send gareko photo",
  "kina send garyo photo",
  "kina photo pathayo",
  "why send photo",
  "why did you send photo",
  "why sent photo",
];

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s?]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsTokenOrPhrase(normalized, words, candidates) {
  return candidates.some((candidate) => {
    const cleanCandidate = candidate.trim().toLowerCase();

    if (!cleanCandidate) {
      return false;
    }

    if (cleanCandidate.includes(" ")) {
      return normalized.includes(cleanCandidate);
    }

    return words.includes(cleanCandidate);
  });
}

function hasQuestionTone(text, normalized, words) {
  if (String(text || "").includes("?")) {
    return true;
  }

  return containsTokenOrPhrase(normalized, words, questionWords);
}

function isBlockedImageMessage(normalized) {
  const words = normalized.split(" ").filter(Boolean);
  const hasWhyWord = words.includes("why") || words.includes("kina");
  const hasSendWord =
    words.includes("send") ||
    words.includes("sent") ||
    words.includes("pathayo") ||
    words.includes("pathaeko");
  const hasImageWord =
    words.includes("photo") ||
    words.includes("image") ||
    words.includes("pic") ||
    words.includes("poster") ||
    words.includes("banner");

  return (
    imageStopPhrases.some((phrase) => normalized.includes(phrase)) ||
    imageComplaintPhrases.some((phrase) => normalized.includes(phrase)) ||
    (hasWhyWord && hasSendWord && hasImageWord)
  );
}

function isExplicitAllMediaRequest(normalized, words) {
  if (containsTokenOrPhrase(normalized, words, allMediaPhrases)) {
    return true;
  }

  const hasAllWord = words.includes("all") || words.includes("sabai");
  const hasImageNoun = containsTokenOrPhrase(normalized, words, imageNouns);

  return hasAllWord && hasImageNoun;
}

function isExplicitSingleMediaRequest(text, normalized, words) {
  const hasImageNoun = containsTokenOrPhrase(normalized, words, imageNouns);

  if (!hasImageNoun) {
    return false;
  }

  const hasRequestWord = containsTokenOrPhrase(normalized, words, requestWords);

  if (hasRequestWord) {
    return true;
  }

  const wordCount = words.length;
  return wordCount > 0 && wordCount <= 4 && !hasQuestionTone(text, normalized, words);
}

export function detectMediaRequest(text) {
  const normalized = normalizeText(text);
  const words = normalized.split(" ").filter(Boolean);

  if (!normalized || isBlockedImageMessage(normalized)) {
    return { type: "none" };
  }

  if (isExplicitAllMediaRequest(normalized, words)) {
    return { type: "all" };
  }

  if (isExplicitSingleMediaRequest(text, normalized, words)) {
    return { type: "single" };
  }

  return { type: "none" };
}
