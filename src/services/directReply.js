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

export function buildDirectReply({ text, languageStyle, matchedPattern }) {
  const normalized = normalize(text);

  if (!normalized || isAcknowledgement(normalized)) {
    return null;
  }

  const replySet = getReplyDictionary(languageStyle);
  const subject = findSubject(normalized);
  const matchedIntent = matchedPattern?.intent ?? null;
  const hasPriceQuestion = containsAny(normalized, priceKeywords);

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

  switch (matchedIntent) {
    case "general_thesis_help":
      return subject ? replySet.subjectOnly(subject.label) : replySet.general;
    case "proposal_only":
      return replySet.proposalOnly;
    case "thesis_only":
      return replySet.thesisOnly;
    case "formatting_only":
      return replySet.formattingOnly;
    case "topic_support":
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
