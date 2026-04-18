const patterns = [
  {
    intent: "greeting",
    examples: ["hello", "hi", "namaste", "namaskar", "hey", "hy", "hello sir"],
    guidance:
      "Greet briefly and ask one useful next question about thesis, proposal, or required support.",
  },
  {
    intent: "general_thesis_help",
    examples: [
      "i want thesis help",
      "thesis garidinuhunchha",
      "mbs ko thesis gardinuhunchha",
      "मलाई thesis ma sahayog chahincha",
      "sociology ko thesis gardinuhunchha",
    ],
    guidance:
      "Ask whether the user needs full thesis, proposal only, or specific chapters, and ask for the subject or programme.",
  },
  {
    intent: "mba_price",
    examples: [
      "mba thesis price",
      "price for mba thesis",
      "mba ko kati parchha",
      "mba ko price kati ho",
    ],
    guidance:
      "For MBA, say the full proposal and thesis package is around NPR 30,000, then ask for topic status or deadline.",
  },
  {
    intent: "non_mba_price",
    examples: [
      "mbs thesis price",
      "mbs ko price kati ho",
      "mbs ko thesis kati parchha",
      "med thesis price",
      "sociology thesis price",
      "proposal ra thesis kati",
      "kati price ho",
    ],
    guidance:
      "For MBS, MEd, Rural Development, Psychology, Sociology, and similar subjects, say thesis only is around NPR 20,000, proposal around NPR 5,000, and full proposal plus thesis around NPR 25,000.",
  },
  {
    intent: "proposal_only",
    examples: [
      "proposal only",
      "proposal matra chahinchha",
      "proposal matra chahincha",
      "malai proposal matra chahinchha",
    ],
    guidance:
      "Confirm proposal-only support is available and ask for the subject or programme and deadline.",
  },
  {
    intent: "thesis_only",
    examples: [
      "thesis only",
      "full thesis only",
      "thesis matra",
      "pura thesis chahinchha",
    ],
    guidance:
      "Confirm thesis-only help is available and ask for the subject or programme and deadline.",
  },
  {
    intent: "chapter_4_5",
    examples: [
      "chapter 4 and 5",
      "chapter 4 ra 5",
      "chapter 4 5 only",
      "chapter 4 ra 5 matra",
    ],
    guidance:
      "Say Chapter 4 and 5 help is available, then ask for the subject, deadline, and whether data is ready.",
  },
  {
    intent: "formatting_only",
    examples: [
      "formatting only",
      "formatting matra",
      "formatting only chahinchha",
      "formatting matra garne ho",
    ],
    guidance:
      "Confirm formatting-only support is available and ask for the university format or deadline.",
  },
  {
    intent: "topic_support",
    examples: [
      "topic dinuhunchha",
      "topic pani dinuhunchha",
      "can you provide topic",
      "topic pani dinuhuncha",
    ],
    guidance:
      "Say topic support can be provided or the user can bring their own topic, then ask for the subject or programme.",
  },
  {
    intent: "supervisor_feedback",
    examples: [
      "supervisor le correction dinu bhayo",
      "my supervisor gave corrections",
      "correction ayo",
      "supervisor feedback aayo",
    ],
    guidance:
      "Confirm revisions based on supervisor feedback are supported and ask the user to share the corrected file or scope.",
  },
  {
    intent: "exact_price_unclear_scope",
    examples: [
      "exact final price kati ho",
      "exact price",
      "final price kati",
      "price fix garnu",
    ],
    guidance:
      "If the scope is unclear, ask the user to share subject, required work, and deadline, and say the team will review and get back.",
  },
  {
    intent: "follow_up_wait",
    examples: [
      "any update",
      "price bhanyena",
      "reply aayena",
      "follow up",
    ],
    guidance:
      "If the user already shared details and is waiting, thank them and say the team needs a little more time and will get back.",
  },
  {
    intent: "unsupported_phd_mphil",
    examples: ["phd thesis", "mphil thesis", "phd ko thesis", "mphil support"],
    guidance:
      "Say clearly and briefly that PhD and MPhil thesis support is not provided.",
  },
  {
    intent: "unsupported_engineering",
    examples: [
      "civil engineering thesis",
      "mechanical engineering thesis",
      "engineering ko thesis",
      "engineering thesis support",
    ],
    guidance:
      "Say clearly and briefly that engineering thesis support is generally not provided.",
  },
];

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreExample(input, example) {
  if (!input || !example) {
    return 0;
  }

  if (input === example) {
    return 100;
  }

  if (input.includes(example) || example.includes(input)) {
    return 80;
  }

  const inputWords = input.split(" ");
  const exampleWords = example.split(" ");
  const overlap = exampleWords.filter((word) => inputWords.includes(word)).length;

  if (overlap === 0) {
    return 0;
  }

  return overlap / Math.max(exampleWords.length, inputWords.length);
}

export function getBestPatternMatch(text) {
  const normalizedText = normalize(text);
  let bestMatch = null;
  let bestScore = 0;

  for (const pattern of patterns) {
    for (const example of pattern.examples) {
      const score = scoreExample(normalizedText, normalize(example));

      if (score > bestScore) {
        bestScore = score;
        bestMatch = pattern;
      }
    }
  }

  if (bestScore >= 0.34 || bestScore >= 80) {
    return bestMatch;
  }

  return null;
}
