import "dotenv/config";

import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";

import { auditRoutes } from "./routes/audit.js";
import { healthRoutes } from "./routes/health.js";
import { allowedOrigins, assertBootConfig, env, isProduction } from "./lib/env.js";

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: { level: isProduction ? "info" : "debug" },
    bodyLimit: env.BODY_LIMIT_BYTES,
    trustProxy: env.TRUST_PROXY,
  });

  // Security headers for the JSON API; the HTML is served by the frontend app,
  // so a CSP here would only break the Swagger-less JSON responses.
  await app.register(helmet, { contentSecurityPolicy: false });

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

void start();
