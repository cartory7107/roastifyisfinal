import "dotenv/config";

import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";

import { auditRoutes } from "./routes/audit.js";
import { fileRoutes } from "./routes/files.js";
import { healthRoutes } from "./routes/health.js";
import {
  allowedOrigins,
  assertBootConfig,
  env,
  hasPocketBaseConfig,
  isProduction,
} from "./lib/env.js";
import { ensureSchema, hasDatabase } from "./lib/db.js";
import { registerErrorHandling } from "./lib/errors.js";
import { failInterruptedAudits } from "./lib/store.js";

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      env.NODE_ENV === "test" ? false : { level: isProduction ? "info" : "debug" },
    bodyLimit: env.BODY_LIMIT_BYTES,
    trustProxy: env.TRUST_PROXY,
  });

  // Must be set before any plugin is registered: a child context inherits the
  // handler that exists when it boots. Registering routes first left Fastify's
  // default error shape in place for body-parse failures.
  registerErrorHandling(app);

  // Security headers for the JSON API; the HTML is served by the frontend app,
  // so a CSP here would only break the Swagger-less JSON responses. The
  // report images are embedded by the Vercel frontend, so resources must be
  // readable cross-origin.
  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  });

  await app.register(cors, {
    origin: allowedOrigins(),
    methods: ["GET", "POST", "OPTIONS"],
    maxAge: 86_400,
  });

  // Opt-in per route: only the expensive POST /audit is rate limited.
  await app.register(rateLimit, {
    global: false,
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW,
  });

  await app.register(healthRoutes);
  await app.register(fileRoutes);
  await app.register(auditRoutes);

  return app;
}

async function start(): Promise<void> {
  try {
    assertBootConfig((message) => console.log(message));
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  const app = await buildServer();

  if (hasDatabase) {
    try {
      await ensureSchema();
      app.log.info("postgres schema ready");
    } catch (err) {
      app.log.error({ err }, "could not prepare the postgres schema");
      process.exit(1);
    }
  }

  if (hasDatabase || hasPocketBaseConfig) {
    try {
      const recovered = await failInterruptedAudits();
      if (recovered > 0) {
        app.log.warn({ recovered }, "marked interrupted audits as failed");
      }
    } catch (err) {
      app.log.error({ err }, "could not recover interrupted audits");
    }
  }

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, "shutting down");
    try {
      await app.close();
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, "shutdown failed");
      process.exit(1);
    }
  };

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("unhandledRejection", (reason) => {
    app.log.error({ err: reason }, "unhandled promise rejection");
  });
  process.on("uncaughtException", (err) => {
    app.log.error({ err }, "uncaught exception");
    process.exit(1);
  });

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

// `buildServer()` stays importable for tests; only a real process boots.
if (process.env.NODE_ENV !== "test") {
  void start();
}
