import "dotenv/config";

const providerArg = process.argv
  .find((argument) => argument.startsWith("--provider="))
  ?.split("=")[1]
  ?.trim()
  .toLowerCase();

const requestedProvider = providerArg || "both";
const validProviders = new Set(["both", "gemini", "deepseek"]);

if (!validProviders.has(requestedProvider)) {
  console.error(
    `Unsupported provider "${requestedProvider}". Use --provider=gemini, --provider=deepseek, or omit the flag for both.`
  );
  process.exit(1);
}

process.env.PORT ||= "3000";
process.env.VERIFY_TOKEN ||= "provider-check-verify-token";
process.env.PAGE_ACCESS_TOKEN ||= "provider-check-page-token";
process.env.GEMINI_BASE_URL ||= "https://generativelanguage.googleapis.com/v1beta";
process.env.GEMINI_MODEL ||= "gemini-2.5-flash";
process.env.DEEPSEEK_BASE_URL ||= "https://api.deepseek.com";
process.env.DEEPSEEK_MODEL ||= "deepseek-chat";
process.env.REQUEST_TIMEOUT_MS ||= "15000";

const shouldCheckGemini =
  requestedProvider === "both" || requestedProvider === "gemini";
const shouldCheckDeepSeek =
  requestedProvider === "both" || requestedProvider === "deepseek";

if (shouldCheckGemini && !process.env.GEMINI_API_KEY?.trim()) {
  console.error("GEMINI_API_KEY is required to check Gemini.");
  process.exit(1);
}

if (shouldCheckDeepSeek && !process.env.DEEPSEEK_API_KEY?.trim()) {
  console.error("DEEPSEEK_API_KEY is required to check DeepSeek.");
  process.exit(1);
}

if (!shouldCheckDeepSeek && !process.env.DEEPSEEK_API_KEY?.trim()) {
  process.env.DEEPSEEK_API_KEY = "provider-check-skip";
}

const { default: config } = await import("../src/config.js");
const { generateReply } = await import("../src/services/deepseek.js");

const promptMessages = [
  {
    role: "system",
    content: "Reply with exactly: OK",
  },
  {
    role: "user",
    content: "health check",
  },
];

async function checkGemini() {
  let deepseekUsed = false;

  const reply = await generateReply({
    currentText: "health check",
    languageStyle: "english",
    promptMessages,
    deepseekRequest: async () => {
      deepseekUsed = true;
      throw new Error("DeepSeek should not run during the Gemini check.");
    },
  });

  if (!reply) {
    throw new Error("Gemini returned an empty reply.");
  }

  if (deepseekUsed) {
    throw new Error("Gemini check unexpectedly fell back to DeepSeek.");
  }

  return reply;
}

async function checkDeepSeek() {
  const originalGeminiApiKey = config.geminiApiKey;

  try {
    config.geminiApiKey = "";

    const reply = await generateReply({
      currentText: "health check",
      languageStyle: "english",
      promptMessages,
    });

    if (!reply) {
      throw new Error("DeepSeek returned an empty reply.");
    }

    return reply;
  } finally {
    config.geminiApiKey = originalGeminiApiKey;
  }
}

const checks = [];

if (shouldCheckGemini) {
  checks.push({
    provider: "gemini",
    run: checkGemini,
  });
}

if (shouldCheckDeepSeek) {
  checks.push({
    provider: "deepseek",
    run: checkDeepSeek,
  });
}

let hasFailure = false;

for (const check of checks) {
  try {
    const reply = await check.run();
    console.log(`[PASS] ${check.provider}: ${reply}`);
  } catch (error) {
    hasFailure = true;
    console.error(`[FAIL] ${check.provider}: ${error.message}`);
  }
}

if (hasFailure) {
  process.exit(1);
}
