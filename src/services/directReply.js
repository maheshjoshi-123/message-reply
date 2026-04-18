const supportedSubjects = [
  {
    key: "mba",
    aliases: ["mba", "master of business administration"],
    label: "MBA",
    tier: "mba",
  },
  {
    key: "mbs",
    aliases: ["mbs", "business studies"],
    label: "MBS",
    tier: "general",
  },
  {
    key: "med",
    aliases: ["med", "m ed", "master of education", "education"],
    label: "MEd",
    tier: "general",
  },
  {
    key: "rural_development",
    aliases: ["rural development", "rural"],
    label: "Rural Development",
    tier: "general",
  },
  {
    key: "psychology",
    aliases: ["psychology"],
    label: "Psychology",
    tier: "general",
  },
  {
    key: "sociology",
    aliases: ["sociology"],
    label: "Sociology",
    tier: "general",
  },
];

const priceKeywords = [
  "price",
  "pricing",
  "cost",
  "rate",
  "kati",
  "parchha",
  "parcha",
];

const thesisKeywords = [
  "thesis",
  "theaia",
  "thesia",
  "proposal",
  "topic",
  "formatting",
  "formating",
  "analysis",
  "chapter",
  "chapters",
  "revision",
  "correction",
  "data",
  "research",
  "viva",
];

const greetingKeywords = [
  "hello",
  "hi",
  "hey",
  "namaste",
  "namaskar",
  "hy",
];

const nextStepKeywords = ["what to do next", "next step", "what next"];

const acknowledgementKeywords = [
  "thanks",
  "thank you",
  "thankyou",
  "dhanyabad",
  "dhanyabaad",
  "ok",
  "okay",
  "hajur",
  "huss",
  "hus",
];

const fillerWords = [
  "ko",
  "lagi",
  "laagi",
  "for",
  "ma",
  "matra",
  "please",
  "plz",
  "send",
  "garnus",
  "garnu",
  "na",
  "dinus",
  "deu",
  "deuna",
  "pathaunu",
];

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s?]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getWords(normalized) {
  return normalized.split(" ").filter(Boolean);
}

function containsAny(normalized, candidates) {
  const words = getWords(normalized);

  return candidates.some((candidate) => {
    if (candidate.includes(" ")) {
      return normalized.includes(candidate);
    }

    return words.includes(candidate);
  });
}

function findSubject(normalized) {
  const words = getWords(normalized);

  return (
    supportedSubjects.find((subject) =>
      subject.aliases.some((alias) => {
        if (alias.includes(" ")) {
          return normalized.includes(alias);
        }

        return words.includes(alias);
      })
    ) || null
  );
}

function getHistoryText(recentMessages = []) {
  return recentMessages
    .map((message) => normalize(message?.content))
    .filter(Boolean)
    .join(" ");
}

function inferContextIntent({ normalized, matchedIntent, recentMessages }) {
  if (matchedIntent) {
    return matchedIntent;
  }

  if (containsAny(normalized, priceKeywords)) {
    return "price_context";
  }

  if (normalized.includes("topic")) {
    return "topic_support";
  }

  if (containsAny(normalized, ["formatting", "formating"])) {
    return "formatting_only";
  }

  if (normalized.includes("proposal")) {
    return "proposal_only";
  }

  const historyText = getHistoryText(recentMessages);

  if (!historyText) {
    return null;
  }

  if (
    historyText.includes("topic support") ||
    historyText.includes("topic") ||
    historyText.includes("subject ra level") ||
    historyText.includes("subject and level")
  ) {
    return "topic_support";
  }

  if (
    historyText.includes("price") ||
    historyText.includes("pricing") ||
    historyText.includes("kati") ||
    historyText.includes("rate")
  ) {
    return "price_context";
  }

  if (historyText.includes("formatting")) {
    return "formatting_only";
  }

  if (historyText.includes("proposal")) {
    return "proposal_only";
  }

  if (historyText.includes("thesis")) {
    return "general_thesis_help";
  }

  return null;
}

function buildScopeLabel(text, subject, contextIntent) {
  const normalized = normalize(text);
  const words = getWords(normalized);
  const removableWords = new Set([
    ...fillerWords,
    ...(contextIntent === "topic_support" ? ["topic"] : []),
    ...(contextIntent === "proposal_only" ? ["proposal"] : []),
    ...(contextIntent === "formatting_only" ? ["formatting", "formating"] : []),
    ...(contextIntent === "price_context"
      ? ["price", "pricing", "cost", "rate", "kati", "parchha", "parcha"]
      : []),
  ]);

  const filteredWords = words.filter((word) => !removableWords.has(word));

  if (!subject) {
    return filteredWords.join(" ").trim() || null;
  }

  const nonSubjectWords = filteredWords.filter(
    (word) => !subject.aliases.includes(word) && word !== subject.key.toLowerCase()
  );

  if (nonSubjectWords.length === 0) {
    return subject.label;
  }

  return `${subject.label} ${nonSubjectWords.join(" ")}`.trim();
}

function getReplyDictionary(languageStyle) {
  if (languageStyle === "english") {
    return {
      greeting:
        "Hello. Do you need full thesis, proposal only, formatting, or topic support?",
      general:
        "Yes, we can help. Do you need full thesis, proposal only, or a specific section?",
      subjectOnly: (subjectLabel) =>
        `Yes, we support ${subjectLabel} thesis work. Do you need full thesis or proposal only?`,
      proposalOnly:
        "Yes, proposal support is available. Please share your subject and deadline.",
      thesisOnly:
        "Yes, thesis support is available. Please share your subject and deadline.",
      formattingOnly:
        "Yes, formatting support is available. Please share your university format and deadline.",
      topicSupport:
        "Yes, topic support is available. Please share your subject and level.",
      supervisorFeedback:
        "Yes, correction support is available. Please share the scope and deadline.",
      followUp:
        "Please share your subject, required work, and deadline so we can guide you correctly.",
      topicFollowUp: (scopeLabel) =>
        `Yes, topic support is available for ${scopeLabel}. Do you need topic titles only or proposal support as well?`,
      formattingFollowUp: (scopeLabel) =>
        `Yes, formatting support is available for ${scopeLabel}. Please share your university format and deadline.`,
      proposalFollowUp: (scopeLabel) =>
        `Yes, proposal support is available for ${scopeLabel}. Please share your deadline.`,
      mbaPrice:
        "For MBA, the full proposal plus thesis package is around NPR 30,000. Is your topic ready or do you need topic help as well?",
      generalPrice: (subjectLabel) =>
        `For ${subjectLabel}, thesis is around NPR 20,000, proposal around NPR 5,000, and the full package around NPR 25,000. Do you need full thesis or proposal only?`,
      neutralPrice:
        "Please share your subject and whether you need thesis, proposal, or formatting so we can guide you correctly.",
    };
  }

  return {
    greeting:
      "Namaste. Tapai lai full thesis, proposal matra, formatting, ki topic support madhye kun chahinchha?",
    general:
      "Huncha. Tapai lai full thesis, proposal matra, ki specific section support chahinchha?",
    subjectOnly: (subjectLabel) =>
      `${subjectLabel} ko thesis support huncha. Full thesis ho ki proposal matra?`,
    proposalOnly:
      "Proposal support huncha. Subject ra deadline pathaunus.",
    thesisOnly:
      "Thesis support huncha. Subject ra deadline pathaunus.",
    formattingOnly:
      "Formatting support huncha. University format ra deadline pathaunus.",
    topicSupport:
      "Topic support huncha. Tapai ko subject ra level pathaunus.",
    supervisorFeedback:
      "Correction support huncha. Scope ra deadline pathaunus.",
    followUp:
      "Tapai ko subject, required work, ra deadline pathaunus. Tespachi thik guidance dinchhu.",
    topicFollowUp: (scopeLabel) =>
      `${scopeLabel} ko lagi topic support huncha. Title matra chahinchha ki proposal support pani?`,
    formattingFollowUp: (scopeLabel) =>
      `${scopeLabel} ko lagi formatting support huncha. University format ra deadline pathaunus.`,
    proposalFollowUp: (scopeLabel) =>
      `${scopeLabel} ko lagi proposal support huncha. Deadline pathaunus.`,
    mbaPrice:
      "MBA ko full proposal ra thesis package around NPR 30,000 huncha. Topic ready chha ki topic support pani chahinchha?",
    generalPrice: (subjectLabel) =>
      `${subjectLabel} ma thesis around NPR 20,000, proposal around NPR 5,000, ra full package around NPR 25,000 huncha. Full thesis ho ki proposal matra?`,
    neutralPrice:
      "Subject ra required work pathaunus. Tespachi thik pricing guide garchhu.",
  };
}

function isAcknowledgement(normalized) {
  return containsAny(normalized, acknowledgementKeywords);
}

function isDomainMessage(normalized, matchedIntent, subject) {
  if (matchedIntent || subject) {
    return true;
  }

  return containsAny(normalized, [
    ...priceKeywords,
    ...thesisKeywords,
    ...greetingKeywords,
    ...nextStepKeywords,
  ]);
}

export function isThesisDomainText({ text, matchedPattern }) {
  const normalized = normalize(text);
  const subject = findSubject(normalized);

  if (!normalized || isAcknowledgement(normalized)) {
    return false;
  }

  return isDomainMessage(normalized, matchedPattern?.intent ?? null, subject);
}

export function buildDirectReply({
  text,
  languageStyle,
  matchedPattern,
  recentMessages = [],
}) {
  const normalized = normalize(text);

  if (!normalized || isAcknowledgement(normalized)) {
    return null;
  }

  const replySet = getReplyDictionary(languageStyle);
  const subject = findSubject(normalized);
  const matchedIntent = inferContextIntent({
    normalized,
    matchedIntent: matchedPattern?.intent ?? null,
    recentMessages,
  });
  const hasPriceQuestion = containsAny(normalized, priceKeywords);
  const scopeLabel = buildScopeLabel(text, subject, matchedIntent);

  if (!isDomainMessage(normalized, matchedIntent, subject)) {
    return null;
  }

  if (containsAny(normalized, greetingKeywords)) {
    return replySet.greeting;
  }

  if (containsAny(normalized, nextStepKeywords)) {
    return replySet.followUp;
  }

  if (hasPriceQuestion) {
    if (subject?.tier === "mba") {
      return replySet.mbaPrice;
    }

    if (subject) {
      return replySet.generalPrice(subject.label);
    }

    if (matchedIntent === "mba_price") {
      return replySet.mbaPrice;
    }

    if (
      matchedIntent === "non_mba_price" ||
      matchedIntent === "exact_price_unclear_scope"
    ) {
      return replySet.neutralPrice;
    }
  }

  if (!hasPriceQuestion && matchedIntent === "price_context" && subject) {
    if (subject.tier === "mba") {
      return replySet.mbaPrice;
    }

    return replySet.generalPrice(subject.label);
  }

  switch (matchedIntent) {
    case "general_thesis_help":
      return subject ? replySet.subjectOnly(subject.label) : replySet.general;
    case "proposal_only":
      if (scopeLabel) {
        return replySet.proposalFollowUp(scopeLabel);
      }
      return replySet.proposalOnly;
    case "thesis_only":
      return replySet.thesisOnly;
    case "formatting_only":
      if (scopeLabel) {
        return replySet.formattingFollowUp(scopeLabel);
      }
      return replySet.formattingOnly;
    case "topic_support":
      if (scopeLabel) {
        return replySet.topicFollowUp(scopeLabel);
      }
      return replySet.topicSupport;
    case "supervisor_feedback":
      return replySet.supervisorFeedback;
    case "follow_up_wait":
      return replySet.followUp;
    default:
      break;
  }

  if (subject) {
    return replySet.subjectOnly(subject.label);
  }

  if (containsAny(normalized, thesisKeywords)) {
    return replySet.general;
  }

  return null;
}
