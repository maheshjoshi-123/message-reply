import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import path from "node:path";
import { fileURLToPath } from "node:url";
import config from "./config.js";
import webhookRouter, { createWebhookRouter } from "./routes/webhook.js";
import { error, info } from "./utils/logger.js";

export function createApp(router = webhookRouter) {
  const app = express();

  app.use(helmet());
  app.use(cors());
  app.use(morgan(":method :status :response-time ms"));
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.use("/", router);

  app.use((req, res) => {
    res.status(404).json({
      ok: false,
      error: "Not Found",
      path: req.originalUrl,
    });
  });

  app.use((err, _req, res, _next) => {
    error("Unhandled Express error.", {
      message: err.message,
    });

    res.status(500).json({
      ok: false,
      error: "Internal Server Error",
    });
  });

  return app;
}

export function startServer() {
  const app = createApp();

  return app.listen(config.port, () => {
    info("Messenger DeepSeek bot server started.", {
      env: config.appEnv,
      port: config.port,
      healthUrl: `http://localhost:${config.port}/health`,
      webhookPath: "/webhook",
      memoryWindow: config.maxMemoryMessages,
    });
  });
}

const isDirectRun =
  Boolean(process.argv[1]) &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectRun) {
  startServer();
}

export { createWebhookRouter };
