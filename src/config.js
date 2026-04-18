import dotenv from "dotenv";

dotenv.config();

const requiredVariables = [
  "PORT",
  "VERIFY_TOKEN",
  "PAGE_ACCESS_TOKEN",
  "DEEPSEEK_API_KEY",
  "DEEPSEEK_BASE_URL",
  "DEEPSEEK_MODEL",
];

const missingVariables = requiredVariables.filter((key) => {
  const value = process.env[key];
  return typeof value !== "string" || value.trim() === "";
});

if (missingVariables.length > 0) {
  console.error(
    `Missing required environment variables: ${missingVariables.join(", ")}`
  );
  process.exit(1);
}

function parseNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readOptionalString(value, fallback = "") {
  if (typeof value !== "string") {
    return fallback;
  }

  const trimmed = value.trim();
  return trimmed || fallback;
}

const config = {
  appEnv: process.env.APP_ENV || "development",
  port: parseNumber(process.env.PORT, 3000),
  verifyToken: process.env.VERIFY_TOKEN.trim(),
  pageAccessToken: process.env.PAGE_ACCESS_TOKEN.trim(),
  geminiApiKey: readOptionalString(process.env.GEMINI_API_KEY),
  geminiBaseUrl: readOptionalString(
    process.env.GEMINI_BASE_URL,
    "https://generativelanguage.googleapis.com/v1beta"
  ),
  geminiModel: readOptionalString(process.env.GEMINI_MODEL, "gemini-2.5-flash"),
  deepseekApiKey: process.env.DEEPSEEK_API_KEY.trim(),
  deepseekBaseUrl: process.env.DEEPSEEK_BASE_URL.trim(),
  deepseekModel: process.env.DEEPSEEK_MODEL.trim(),
  modelTemperature: parseNumber(process.env.MODEL_TEMPERATURE, 0.4),
  modelMaxTokens: parseNumber(process.env.MODEL_MAX_TOKENS, 120),
  memoryWindow: parseNumber(
    process.env.MAX_MEMORY_MESSAGES || process.env.MEMORY_WINDOW,
    8
  ),
  maxMemoryMessages: parseNumber(
    process.env.MAX_MEMORY_MESSAGES || process.env.MEMORY_WINDOW,
    8
  ),
  requestTimeoutMs: parseNumber(process.env.REQUEST_TIMEOUT_MS, 5000),
  imageAnalysisProvider: (
    process.env.IMAGE_ANALYSIS_PROVIDER || "none"
  ).trim().toLowerCase(),
  publicBaseUrl: (process.env.PUBLIC_BASE_URL || "").trim(),
  messengerApiBaseUrl: (
    process.env.MESSENGER_API_BASE_URL || "https://graph.facebook.com/v23.0"
  ).trim(),
  webhookDebounceMs: parseNumber(process.env.WEBHOOK_DEBOUNCE_MS, 1200),
  retryCount: parseNumber(process.env.REQUEST_RETRY_COUNT, 2),
};

if (config.port <= 0) {
  console.error("PORT must be a valid positive number.");
  process.exit(1);
}

if (config.modelTemperature < 0 || config.modelTemperature > 2) {
  console.error("MODEL_TEMPERATURE must be between 0 and 2.");
  process.exit(1);
}

if (config.modelMaxTokens <= 0) {
  console.error("MODEL_MAX_TOKENS must be a positive number.");
  process.exit(1);
}

if (config.memoryWindow <= 0) {
  console.error("MAX_MEMORY_MESSAGES or MEMORY_WINDOW must be a positive number.");
  process.exit(1);
}

if (config.requestTimeoutMs <= 0) {
  console.error("REQUEST_TIMEOUT_MS must be a positive number.");
  process.exit(1);
}

if (config.webhookDebounceMs < 0) {
  console.error("WEBHOOK_DEBOUNCE_MS must be zero or a positive number.");
  process.exit(1);
}

if (config.retryCount < 0) {
  console.error("REQUEST_RETRY_COUNT must be zero or a positive number.");
  process.exit(1);
}

export default config;
