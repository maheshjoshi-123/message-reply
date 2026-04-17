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

const config = {
  appEnv: process.env.APP_ENV || "development",
  port: parseNumber(process.env.PORT, 3000),
  verifyToken: process.env.VERIFY_TOKEN.trim(),
  pageAccessToken: process.env.PAGE_ACCESS_TOKEN.trim(),
  deepseekApiKey: process.env.DEEPSEEK_API_KEY.trim(),
  deepseekBaseUrl: process.env.DEEPSEEK_BASE_URL.trim(),
  deepseekModel: process.env.DEEPSEEK_MODEL.trim(),
  modelTemperature: parseNumber(process.env.MODEL_TEMPERATURE, 0.4),
  modelMaxTokens: parseNumber(process.env.MODEL_MAX_TOKENS, 120),
  memoryWindow: parseNumber(process.env.MEMORY_WINDOW, 8),
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
  console.error("MEMORY_WINDOW must be a positive number.");
  process.exit(1);
}

export default config;
