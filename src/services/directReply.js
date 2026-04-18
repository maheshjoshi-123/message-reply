const supportedSubjects = [
  {
    label: "MBA",
    tier: "mba",
    aliases: ["mba", "master of business administration"],
  },
  {
    label: "MBS",
    tier: "general",
    aliases: ["mbs", "business studies"],
  },
  {
    label: "MEd",
    tier: "general",
    aliases: ["med", "m ed", "master of education"],
  },
  {
    label: "Rural Development",
    tier: "general",
    aliases: ["rural development"],
  },
  {
    label: "Psychology",
    tier: "general",
    aliases: ["psychology"],
  },
  {
    label: "Sociology",
    tier: "general",
    aliases: ["sociology"],
  },
];

const greetingWords = ["hello", "hi", "hey", "hy", "namaste", "namaskar"];
const clarificationPhrases = [
  "k bhanay ko",
  "k bhane ko",
  "what do you mean",
  "what",
  "k",
  "ke",
];
const subjectListPhrases = [
  "kun kun subject",
  "which subjects",
  "what subjects",
  "what type of subject",
];
const nextStepPhrases = ["what to do next", "what next", "next step"];
const priceWords = ["price", "pricing", "cost", "kati", "rate", "charge"];
const topicWords = ["topic"];
const proposalWords = ["proposal", "proposal only", "only proposal", "proposal matra"];
const titleOnlyPhrases = ["title only", "titles only", "title matra", "titles matra"];
const thesisWords = [
  "thesis",
  "full thesis",
  "complete thesis",
  "completely done",
  "thesis hunxa",
];
const formattingWords = ["formatting", "formating"];
const analysisWords = [
  "analysis",
  "data analysis",
  "statistics",
  "statistical analysis",
  "spss",
  "stata",
  "excel analysis",
];
const affirmativeWords = ["yes", "ho", "hajur", "huncha", "ok", "okay"];
const unsupportedBroadWords = ["science", "bio", "chemistry", "physics"];
const subjectStopWords = [
  "ko",
  "lagi",
  "laagi",
  "for",
  "ma",
  "on",
  "need",
  "i",
  "a",
  "the",
  "subject",
  "topic",
  "proposal",
  "thesis",
  "formatting",
  "support",
  "full",
  "only",
  "matra",
  "hunxa",
  "huncha",
  "chahinchha",
  "can",
  "you",
  "do",
  "my",
  "your",
  "please",
  "done",
];

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getWords(text) {
  return normalize(text).split(" ").filter(Boolean);
}

function includesAny(normalized, candidates) {
  const words = normalized.split(" ").filter(Boolean);

  return candidates.some((candidate) => {
    const clean = candidate.toLowerCase();
    return clean.includes(" ") ? normalized.includes(clean) : words.includes(clean);
  });
}

function detectGreeting(text) {
  const normalized = normalize(text);
  return greetingWords.includes(normalized);
}

function detectKnownSubject(text) {
  const normalized = normalize(text);
  const words = normalized.split(" ").filter(Boolean);

  return (
    supportedSubjects.find((subject) =>
      subject.aliases.some((alias) =>
        alias.includes(" ") ? normalized.includes(alias) : words.includes(alias)
      )
    ) || null
  );
}

function detectDeadline(text) {
  const normalized = normalize(text);
  const match = normalized.match(
    /\b(\d+)\s*(day|days|week|weeks|month|months|mahina|din)\b/u
  );

  if (match) {
    return `${match[1]} ${match[2]}`;
  }

  if (normalized.includes("urgent") || normalized.includes("chito")) {
    return "urgent";
  }

  return null;
}

function extractSubjectDisplay(text, knownSubject) {
  if (!knownSubject) {
    return null;
  }

  const words = getWords(text).filter((word) => !subjectStopWords.includes(word));
  const subjectAliasWords = new Set(
    knownSubject.aliases.flatMap((alias) => alias.split(" "))
  );
  const extraWords = words.filter((word) => !subjectAliasWords.has(word));

  if (extraWords.length === 0) {
    return knownSubject.label;
  }

  return `${knownSubject.label} ${extraWords.join(" ")}`.trim();
}

function detectServiceType(text) {
  const normalized = normalize(text);

  if (includesAny(normalized, formattingWords)) {
    return "formatting";
  }

  if (
    normalized.includes("proposal") &&
    (normalized.includes("chaina") ||
      normalized.includes("xaina") ||
      normalized.includes("chhaina"))
  ) {
    return "proposal_start";
  }

  if (includesAny(normalized, topicWords)) {
    return "topic";
  }

  if (includesAny(normalized, proposalWords)) {
    return "proposal";
  }

  if (includesAny(normalized, thesisWords)) {
    return "thesis";
  }

  return null;
}

function detectTitleOnlyChoice(text) {
  return includesAny(normalize(text), titleOnlyPhrases);
}

function detectAnalysisRequest(text) {
  return includesAny(normalize(text), analysisWords);
}

function isPriceQuestion(text) {
  return includesAny(normalize(text), priceWords);
}

function isSubjectListQuestion(text) {
  return includesAny(normalize(text), subjectListPhrases);
}

function isClarificationRequest(text) {
  const normalized = normalize(text);
  const words = normalized.split(" ").filter(Boolean);

  if (!clarificationPhrases.includes(normalized)) {
    return false;
  }

  return words.length <= 4;
}

function isBroadUnsupportedSubject(text) {
  return includesAny(normalize(text), unsupportedBroadWords);
}

function isAffirmative(text) {
  return includesAny(normalize(text), affirmativeWords);
}

function detectFullThesisChoice(text) {
  const normalized = normalize(text);
  return ["full", "full thesis", "complete", "complete thesis"].includes(normalized);
}

function isSameKnownSubjectAsConversation(subject, conversation) {
  return Boolean(
    subject &&
      conversation.subject &&
      subject.label === conversation.subject.label
  );
}

function detectHowManyQuestion(text) {
  const normalized = normalize(text);
  return normalized.includes("how many") && includesAny(normalized, ["thesis", "proposal"]);
}

function detectProposalTypeQuestion(text) {
  const normalized = normalize(text);
  return normalized.includes("what type") && normalized.includes("proposal");
}

function detectNextStepQuestion(text) {
  return includesAny(normalize(text), nextStepPhrases);
}

function looksLikeSubjectCandidate(text) {
  const normalized = normalize(text);
  const words = normalized.split(" ").filter(Boolean);

  if (words.length === 0 || words.length > 4) {
    return false;
  }

  if (
    detectKnownSubject(text) ||
    detectDeadline(text) ||
    detectServiceType(text) ||
    detectAnalysisRequest(text) ||
    isPriceQuestion(text) ||
    isSubjectListQuestion(text) ||
    isClarificationRequest(text) ||
    detectHowManyQuestion(text) ||
    detectProposalTypeQuestion(text) ||
    detectNextStepQuestion(text)
  ) {
    return false;
  }

  return true;
}

function supportedSubjectsReply(languageStyle) {
  if (languageStyle === "english") {
    return "We mainly support MBA, MBS, MEd, Rural Development, Sociology, Psychology, and similar management or social science subjects.";
  }

  return "Hami mainly MBA, MBS, MEd, Rural Development, Sociology, Psychology, ra similar management wa social science subjects support garchhau.";
}

function greetingReply(languageStyle) {
  if (languageStyle === "english") {
    return "Hello. Please share whether you need thesis, proposal, topic, formatting, or pricing help.";
  }

  return "Namaste. Thesis, proposal, topic, formatting, wa pricing madhye kun help chahinchha pathaunus.";
}

function clarificationReply(languageStyle, conversation) {
  const lastAsked = conversation.lastAsked;

  if (languageStyle === "english") {
    if (lastAsked === "scope") {
      return "I mean whether you need full thesis or proposal only.";
    }

    if (lastAsked === "deadline") {
      return "Deadline means your final submission date. Please share when you need it.";
    }

    if (lastAsked === "subject") {
      return "Please share your exact subject, for example MBA, MBS, or MEd.";
    }

    if (lastAsked === "topic_scope") {
      return "I mean whether you need topic titles only or proposal support as well.";
    }

    return "Please share your exact requirement and I will guide you.";
  }

  if (lastAsked === "scope") {
    return "Mero meaning full thesis chahinchha ki proposal matra bhanera ho.";
  }

  if (lastAsked === "deadline") {
    return "Deadline bhaneko final submission date ho. Kahile samma chahinchha pathaunus.";
  }

  if (lastAsked === "subject") {
    return "Exact subject pathaunus, jastai MBA, MBS, wa MEd.";
  }

  if (lastAsked === "topic_scope") {
    return "Mero meaning topic titles matra chahinchha ki proposal support pani bhanera ho.";
  }

  return "Tapai ko exact requirement pathaunus. Tespachi thik guide garchhu.";
}

function priceReply(languageStyle, conversation, subject, serviceType) {
  const activeSubject = subject || conversation.subject;
  const requestedService = serviceType || conversation.serviceType;

  if (languageStyle === "english") {
    if (activeSubject?.tier === "mba") {
      if (requestedService === "proposal") {
        return "For MBA, the full proposal plus thesis package is around NPR 30,000. For proposal-only confirmation, please share your deadline and exact scope.";
      }

      return "For MBA, the full proposal plus thesis package is around NPR 30,000. If you need proposal only, please share your deadline and scope for confirmation.";
    }

    if (activeSubject) {
      if (requestedService === "proposal") {
        return `For ${activeSubject.label}, proposal is around NPR 5,000. Please share your deadline if you want exact confirmation.`;
      }

      if (requestedService === "thesis") {
        return `For ${activeSubject.label}, thesis is around NPR 20,000. Please share your deadline if any part is urgent.`;
      }

      return `For ${activeSubject.label}, proposal is around NPR 5,000, thesis around NPR 20,000, and the full package around NPR 25,000.`;
    }

    return "For MBA, the full proposal plus thesis package is around NPR 30,000. For similar other subjects, proposal is around NPR 5,000, thesis around NPR 20,000, and full package around NPR 25,000.";
  }

  if (activeSubject?.tier === "mba") {
    if (requestedService === "proposal") {
      return "MBA ko full proposal ra thesis package around NPR 30,000 huncha. Proposal matra ko exact confirmation ko lagi deadline ra scope pathaunus.";
    }

    return "MBA ko full proposal ra thesis package around NPR 30,000 huncha. Proposal matra chahinchha bhane deadline ra scope pathaunus.";
  }

  if (activeSubject) {
    if (requestedService === "proposal") {
      return `${activeSubject.label} ma proposal around NPR 5,000 huncha. Exact confirmation ko lagi deadline pathaunus.`;
    }

    if (requestedService === "thesis") {
      return `${activeSubject.label} ma thesis around NPR 20,000 huncha. Urgent cha bhane deadline pani pathaunus.`;
    }

    return `${activeSubject.label} ma proposal around NPR 5,000, thesis around NPR 20,000, ra full package around NPR 25,000 huncha.`;
  }

  return "MBA ko full proposal ra thesis package around NPR 30,000 huncha. Aru similar subjects ma proposal around NPR 5,000, thesis around NPR 20,000, ra full package around NPR 25,000 huncha.";
}

function priceNeedsSubjectReply(languageStyle) {
  if (languageStyle === "english") {
    return "Please share your exact subject or programme first. Then I can guide the right scope and price.";
  }

  return "Paila exact subject wa programme pathaunus. Tespachi thik scope ra price guide garchhu.";
}

function proposalNotReadyReply(languageStyle) {
  if (languageStyle === "english") {
    return "That is okay. We can start from the proposal stage as well. Please share your subject and deadline.";
  }

  return "Proposal chaina bhane pani huncha. Hami proposal bata suru garera support garchhau. Subject ra deadline pathaunus.";
}

function proposalTypeReply(languageStyle) {
  if (languageStyle === "english") {
    return "Proposal means thesis proposal writing support. Please share your subject and deadline.";
  }

  return "Proposal bhaneko thesis proposal writing support ho. Subject ra deadline pathaunus.";
}

function experienceReply(languageStyle) {
  if (languageStyle === "english") {
    return "We do not share exact counts here, but we regularly support masters thesis, proposal, formatting, and analysis work. Please share your subject.";
  }

  return "Exact count yaha share gardainau, tara hami regular masters thesis, proposal, formatting, ra analysis support garchhau. Subject pathaunus.";
}

function unsupportedBroadReply(languageStyle) {
  if (languageStyle === "english") {
    return "Please share your exact subject. We mainly support masters work in management and social science areas.";
  }

  return "Exact subject pathaunus. Hami mainly management ra social science tira ko masters support garchhau.";
}

function nextStepReply(languageStyle) {
  if (languageStyle === "english") {
    return "Please share your subject, required work, and deadline. Then I can guide the next step properly.";
  }

  return "Subject, required work, ra deadline pathaunus. Tespachi next step thik bhanchhu.";
}

function askSubjectReply(languageStyle) {
  if (languageStyle === "english") {
    return "Please share your exact subject or programme first.";
  }

  return "Paila exact subject wa programme pathaunus.";
}

function scopeChoiceReply(languageStyle) {
  if (languageStyle === "english") {
    return "Please choose one: full thesis or proposal only.";
  }

  return "Ek choti choose garnus: full thesis ki proposal matra.";
}

function topicScopeChoiceReply(languageStyle) {
  if (languageStyle === "english") {
    return "Please choose one: topic titles only or proposal support as well.";
  }

  return "Ek choti choose garnus: title matra ki proposal support pani.";
}

function titleOnlyReply(languageStyle, subjectText) {
  if (languageStyle === "english") {
    return `Topic title support is available for ${subjectText}. Please share your deadline.`;
  }

  return `${subjectText} ko lagi topic title support huncha. Deadline pathaunus.`;
}

function askDeadline(languageStyle, subjectLabel, serviceLabel) {
  if (languageStyle === "english") {
    return `${serviceLabel} support is available for ${subjectLabel}. Please share your deadline.`;
  }

  return `${subjectLabel} ko lagi ${serviceLabel} support huncha. Deadline pathaunus.`;
}

function deadlineReply(languageStyle, conversation) {
  const subjectLabel = conversation.subject?.label || "yo scope";

  if (languageStyle === "english") {
    return `${subjectLabel} for that timeline looks manageable. If you already have any file, topic, or requirement, please share it.`;
  }

  return `${subjectLabel} ko lagi tyo timeline milcha. File, topic, wa exact requirement chha bhane pathaunus.`;
}

function topicReply(languageStyle, subjectText) {
  if (languageStyle === "english") {
    return `Topic support is available for ${subjectText}. Do you need topic titles only or proposal support as well?`;
  }

  return `${subjectText} ko lagi topic support huncha. Title matra chahinchha ki proposal support pani?`;
}

function fullThesisReply(languageStyle, subject) {
  if (languageStyle === "english") {
    if (subject) {
      return `${subject.label} thesis support is available. Please share your deadline.`;
    }

    return "Full thesis support is available. Please share your subject and deadline.";
  }

  if (subject) {
    return `${subject.label} ko thesis support huncha. Deadline pathaunus.`;
  }

  return "Full thesis support huncha. Subject ra deadline pathaunus.";
}

function scopeQuestionReply(languageStyle, subject) {
  if (languageStyle === "english") {
    if (subject) {
      return `${subject.label} thesis support is available. Do you need full thesis or proposal only?`;
    }

    return "Yes, we can help. Do you need full thesis or proposal only?";
  }

  if (subject) {
    return `${subject.label} ko thesis support huncha. Full thesis ho ki proposal matra?`;
  }

  return "Huncha. Full thesis chahinchha ki proposal matra?";
}

function proposalReply(languageStyle, subject) {
  if (languageStyle === "english") {
    if (subject) {
      return `Proposal support is available for ${subject.label}. Please share your deadline.`;
    }

    return "Proposal support is available. Please share your subject and deadline.";
  }

  if (subject) {
    return `${subject.label} ko proposal support huncha. Deadline pathaunus.`;
  }

  return "Proposal support huncha. Subject ra deadline pathaunus.";
}

function formattingReply(languageStyle, subject) {
  if (languageStyle === "english") {
    if (subject) {
      return `Formatting support is available for ${subject.label}. Please share your university format and deadline.`;
    }

    return "Formatting support is available. Please share your university format and deadline.";
  }

  if (subject) {
    return `${subject.label} ko formatting support huncha. University format ra deadline pathaunus.`;
  }

  return "Formatting support huncha. University format ra deadline pathaunus.";
}

function analysisReply(languageStyle, subject) {
  if (languageStyle === "english") {
    if (subject) {
      return `${subject.label} analysis support is available. Please share your deadline and required tool.`;
    }

    return "Analysis support is available. Please share your subject, required tool, and deadline.";
  }

  if (subject) {
    return `${subject.label} ko analysis support huncha. Deadline ra required tool pathaunus.`;
  }

  return "Analysis support huncha. Subject, required tool, ra deadline pathaunus.";
}

function deadlineWithoutScopeReply(languageStyle) {
  if (languageStyle === "english") {
    return "Please share your subject and required work as well. Then I can guide properly for that deadline.";
  }

  return "Subject ra required work pani pathaunus. Tespachi tyo deadline anusar thik guide garchhu.";
}

function needsAI(text) {
  const normalized = normalize(text);
  const words = normalized.split(" ").filter(Boolean);

  if (words.length >= 5) {
    return true;
  }

  if (
    normalized.includes("completely done") ||
    normalized.includes("need a thesis") ||
    normalized.includes("need full thesis") ||
    normalized.includes("i need")
  ) {
    return true;
  }

  return false;
}

export function isThesisDomainText({ text, matchedPattern }) {
  const normalized = normalize(text);

  if (!normalized) {
    return false;
  }

  if (matchedPattern?.intent) {
    return true;
  }

  return (
    detectKnownSubject(text) ||
    detectServiceType(text) ||
    isPriceQuestion(text) ||
    isSubjectListQuestion(text) ||
    isClarificationRequest(text) ||
    detectHowManyQuestion(text) ||
    detectProposalTypeQuestion(text) ||
    includesAny(normalized, ["subject", "deadline", "thesis", "proposal", "topic"])
  );
}

export function buildDirectReply({
  text,
  languageStyle,
  matchedPattern,
  conversationState = {},
}) {
  const normalized = normalize(text);
  const subject = detectKnownSubject(text);
  const subjectDisplay = extractSubjectDisplay(text, subject);
  const deadline = detectDeadline(text);
  const serviceType = detectServiceType(text);
  const conversation = {
    lastAsked: null,
    serviceType: null,
    subject: null,
    subjectTier: null,
    subjectPurpose: null,
    deadline: null,
    ...conversationState,
  };

  if (!normalized) {
    return null;
  }

  if (detectGreeting(text)) {
    return {
      reply: greetingReply(languageStyle),
      conversationState: {
        lastAsked: "service",
        serviceType: null,
        subject: null,
        subjectTier: null,
        subjectDisplay: null,
        subjectPurpose: null,
        deadline: null,
      },
    };
  }

  if (isClarificationRequest(text)) {
    return {
      reply: clarificationReply(languageStyle, conversation),
    };
  }

  if (detectHowManyQuestion(text)) {
    return {
      reply: experienceReply(languageStyle),
      conversationState: {
        lastAsked: "subject",
        subjectPurpose: "service",
      },
    };
  }

  if (detectProposalTypeQuestion(text)) {
    return {
      reply: proposalTypeReply(languageStyle),
      conversationState: {
        lastAsked: "subject",
        serviceType: "proposal",
        subjectPurpose: "service",
      },
    };
  }

  if (detectNextStepQuestion(text)) {
    return {
      reply: nextStepReply(languageStyle),
      conversationState: {
        ...conversation,
        lastAsked: "subject",
        subjectPurpose: "service",
      },
    };
  }

  if (detectAnalysisRequest(text)) {
    const activeSubject = subject || conversation.subject;

    return {
      reply: analysisReply(languageStyle, activeSubject),
      conversationState: {
        ...conversation,
        serviceType: "analysis",
        subject: activeSubject,
        subjectTier: activeSubject?.tier || conversation.subjectTier,
        subjectDisplay: subjectDisplay || conversation.subjectDisplay,
        subjectPurpose: activeSubject ? null : "service",
        lastAsked: activeSubject ? "deadline" : "subject",
      },
    };
  }

  if (isSubjectListQuestion(text)) {
    return {
      reply: supportedSubjectsReply(languageStyle),
      conversationState: {
        lastAsked: "subject",
        subjectPurpose: "service",
      },
    };
  }

  if (isBroadUnsupportedSubject(text)) {
    return {
      reply: unsupportedBroadReply(languageStyle),
      conversationState: {
        lastAsked: "subject",
        subjectPurpose: "service",
      },
    };
  }

  if (isPriceQuestion(text)) {
    if (
      !subject &&
      !conversation.subject &&
      conversation.lastAsked === "subject" &&
      conversation.subjectPurpose === "service"
    ) {
      return {
        reply: priceNeedsSubjectReply(languageStyle),
        conversationState: {
          ...conversation,
          lastAsked: "subject",
          subjectPurpose: "service",
        },
      };
    }

    if (!subject && (normalized.includes("topic") || needsAI(text))) {
      return {
        reply: priceNeedsSubjectReply(languageStyle),
        conversationState: {
          ...conversation,
          lastAsked: "subject",
          subjectPurpose: "pricing",
        },
      };
    }

    return {
      reply: priceReply(languageStyle, conversation, subject, serviceType),
      conversationState: {
        ...conversation,
        subject: subject || conversation.subject,
        subjectTier: subject?.tier || conversation.subjectTier,
        subjectDisplay: subjectDisplay || conversation.subjectDisplay,
        subjectPurpose:
          subject || conversation.subject ? null : "pricing",
        lastAsked: subject || conversation.subject ? "service" : "subject",
      },
    };
  }

  if (serviceType === "proposal_start") {
    return {
      reply: proposalNotReadyReply(languageStyle),
      conversationState: {
        ...conversation,
        serviceType: "proposal",
        subjectPurpose: "service",
        lastAsked: "subject",
      },
    };
  }

  if (conversation.lastAsked === "scope" && detectFullThesisChoice(text)) {
    const activeSubject = subject || conversation.subject;

    return {
      reply: fullThesisReply(languageStyle, activeSubject),
      conversationState: {
        ...conversation,
        serviceType: "thesis",
        subject: activeSubject,
        subjectTier: activeSubject?.tier || conversation.subjectTier,
        subjectDisplay: subjectDisplay || conversation.subjectDisplay,
        subjectPurpose: null,
        lastAsked: activeSubject ? "deadline" : "subject",
      },
    };
  }

  if (conversation.lastAsked === "scope" && isAffirmative(text)) {
    return {
      reply: scopeChoiceReply(languageStyle),
    };
  }

  if (conversation.lastAsked === "topic_scope" && isAffirmative(text)) {
    return {
      reply: topicScopeChoiceReply(languageStyle),
    };
  }

  if (conversation.lastAsked === "topic_scope" && detectTitleOnlyChoice(text)) {
    const activeSubjectText =
      conversation.subjectDisplay || conversation.subject?.label || "yo subject";

    return {
      reply: titleOnlyReply(languageStyle, activeSubjectText),
      conversationState: {
        ...conversation,
        serviceType: "topic",
        lastAsked: "deadline",
      },
    };
  }

  if (serviceType === "proposal") {
    const activeSubject = subject || conversation.subject;

    return {
      reply: activeSubject
        ? askDeadline(languageStyle, activeSubject.label, "proposal")
        : proposalReply(languageStyle, null),
      conversationState: {
        ...conversation,
        serviceType: "proposal",
        subject: activeSubject,
        subjectTier: activeSubject?.tier || conversation.subjectTier,
        subjectDisplay: subjectDisplay || conversation.subjectDisplay,
        subjectPurpose: null,
        lastAsked: activeSubject ? "deadline" : "subject",
      },
    };
  }

  if (serviceType === "formatting") {
    const activeSubject = subject || conversation.subject;

    return {
      reply: activeSubject
        ? formattingReply(languageStyle, activeSubject)
        : formattingReply(languageStyle, null),
      conversationState: {
        ...conversation,
        serviceType: "formatting",
        subject: activeSubject,
        subjectTier: activeSubject?.tier || conversation.subjectTier,
        subjectDisplay: subjectDisplay || conversation.subjectDisplay,
        subjectPurpose: activeSubject ? null : "service",
        lastAsked: activeSubject ? "deadline" : "subject",
      },
    };
  }

  if (serviceType === "topic") {
    const activeSubject = subject || conversation.subject;

    if (activeSubject) {
      return {
        reply: topicReply(
          languageStyle,
          subjectDisplay || conversation.subjectDisplay || activeSubject.label
        ),
        conversationState: {
          ...conversation,
          serviceType: "topic",
          subject: activeSubject,
          subjectTier: activeSubject.tier,
          subjectDisplay: subjectDisplay || conversation.subjectDisplay || activeSubject.label,
          lastAsked: "topic_scope",
        },
      };
    }

    if (needsAI(text)) {
      return null;
    }

    return {
      reply:
        languageStyle === "english"
          ? "Topic support is available. Please share your subject and level."
          : "Topic support huncha. Subject ra level pathaunus.",
      conversationState: {
        ...conversation,
        serviceType: "topic",
        subjectPurpose: "service",
        lastAsked: "subject",
      },
    };
  }

  if (serviceType === "thesis") {
    const activeSubject = subject || conversation.subject;

    if (needsAI(text) && !activeSubject) {
      return {
        reply: fullThesisReply(languageStyle, null),
        conversationState: {
          ...conversation,
          serviceType: "thesis",
          subjectPurpose: "service",
          lastAsked: "subject",
        },
      };
    }

    if (
      conversation.lastAsked === "scope" ||
      normalize(text) === "full thesis" ||
      normalized.includes("full thesis")
    ) {
      return {
        reply: fullThesisReply(languageStyle, activeSubject),
        conversationState: {
          ...conversation,
          serviceType: "thesis",
          subject: activeSubject,
          subjectTier: activeSubject?.tier || conversation.subjectTier,
          subjectDisplay: subjectDisplay || conversation.subjectDisplay,
          subjectPurpose: null,
          lastAsked: activeSubject ? "deadline" : "subject",
        },
      };
    }

    return {
      reply: scopeQuestionReply(languageStyle, activeSubject),
      conversationState: {
        ...conversation,
          serviceType: "thesis",
          subject: activeSubject,
          subjectTier: activeSubject?.tier || conversation.subjectTier,
          subjectDisplay: subjectDisplay || conversation.subjectDisplay,
          subjectPurpose: null,
          lastAsked: "scope",
        },
      };
  }

  if (subject && conversation.lastAsked === "subject") {
    if (conversation.serviceType === null && conversation.subjectPurpose === "pricing") {
      return {
        reply: priceReply(languageStyle, conversation, subject),
        conversationState: {
          ...conversation,
          subject,
          subjectTier: subject.tier,
          subjectDisplay: subjectDisplay || subject.label,
          subjectPurpose: null,
          lastAsked: "service",
        },
      };
    }

    if (conversation.serviceType === "proposal") {
      return {
        reply: askDeadline(languageStyle, subject.label, "proposal"),
        conversationState: {
          ...conversation,
          subject,
          subjectTier: subject.tier,
          subjectDisplay: subjectDisplay || subject.label,
          subjectPurpose: null,
          lastAsked: "deadline",
        },
      };
    }

    if (conversation.serviceType === "formatting") {
      return {
        reply: formattingReply(languageStyle, subject),
        conversationState: {
          ...conversation,
          subject,
          subjectTier: subject.tier,
          subjectDisplay: subjectDisplay || subject.label,
          subjectPurpose: null,
          lastAsked: "deadline",
        },
      };
    }

    if (conversation.serviceType === "analysis") {
      return {
        reply: analysisReply(languageStyle, subject),
        conversationState: {
          ...conversation,
          subject,
          subjectTier: subject.tier,
          subjectDisplay: subjectDisplay || subject.label,
          subjectPurpose: null,
          lastAsked: "deadline",
        },
      };
    }

    if (conversation.serviceType === "topic") {
      return {
        reply: topicReply(languageStyle, subjectDisplay || subject.label),
        conversationState: {
          ...conversation,
          subject,
          subjectTier: subject.tier,
          subjectDisplay: subjectDisplay || subject.label,
          subjectPurpose: null,
          lastAsked: "topic_scope",
        },
      };
    }

    return {
      reply: scopeQuestionReply(languageStyle, subject),
      conversationState: {
        ...conversation,
        subject,
        subjectTier: subject.tier,
        subjectDisplay: subjectDisplay || subject.label,
        subjectPurpose: null,
        lastAsked: "scope",
      },
    };
  }

  if (
    conversation.lastAsked === "scope" &&
    isSameKnownSubjectAsConversation(subject, conversation)
  ) {
    return {
      reply: scopeChoiceReply(languageStyle),
      conversationState: {
        ...conversation,
        subject,
        subjectTier: subject.tier,
        subjectDisplay: subjectDisplay || conversation.subjectDisplay || subject.label,
        lastAsked: "scope",
      },
    };
  }

  if (
    conversation.lastAsked === "topic_scope" &&
    isSameKnownSubjectAsConversation(subject, conversation)
  ) {
    return {
      reply: topicScopeChoiceReply(languageStyle),
      conversationState: {
        ...conversation,
        subject,
        subjectTier: subject.tier,
        subjectDisplay: subjectDisplay || conversation.subjectDisplay || subject.label,
        lastAsked: "topic_scope",
      },
    };
  }

  if (deadline && conversation.lastAsked === "subject") {
    return {
      reply: askSubjectReply(languageStyle),
      conversationState: {
        ...conversation,
        lastAsked: "subject",
      },
    };
  }

  if (deadline && conversation.lastAsked === "scope") {
    return {
      reply: scopeChoiceReply(languageStyle),
      conversationState: {
        ...conversation,
        deadline,
        lastAsked: "scope",
      },
    };
  }

  if (deadline && conversation.lastAsked === "topic_scope") {
    return {
      reply: topicScopeChoiceReply(languageStyle),
      conversationState: {
        ...conversation,
        deadline,
        lastAsked: "topic_scope",
      },
    };
  }

  if (conversation.lastAsked === "subject" && looksLikeSubjectCandidate(text)) {
    return {
      reply: unsupportedBroadReply(languageStyle),
      conversationState: {
        ...conversation,
        subjectPurpose: "service",
        lastAsked: "subject",
      },
    };
  }

  if (subject) {
    return {
      reply: scopeQuestionReply(languageStyle, subject),
      conversationState: {
        ...conversation,
        subject,
        subjectTier: subject.tier,
        subjectDisplay: subjectDisplay || subject.label,
        subjectPurpose: null,
        lastAsked: "scope",
      },
    };
  }

  if (deadline && conversation.lastAsked === "deadline") {
    return {
      reply: deadlineReply(languageStyle, {
        ...conversation,
        deadline,
      }),
      conversationState: {
        ...conversation,
        deadline,
        subjectPurpose: null,
        lastAsked: null,
      },
    };
  }

  if (
    deadline &&
    !subject &&
    !conversation.subject &&
    !serviceType &&
    !conversation.serviceType
  ) {
    return {
      reply: deadlineWithoutScopeReply(languageStyle),
      conversationState: {
        ...conversation,
        deadline,
        lastAsked: "subject",
      },
    };
  }

  if (!matchedPattern?.intent) {
    return null;
  }

  return null;
}
