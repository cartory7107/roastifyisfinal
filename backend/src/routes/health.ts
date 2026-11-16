import type { FastifyPluginAsync } from "fastify";

import { env, hasPocketBaseConfig } from "../lib/env.js";

const PROBE_TIMEOUT_MS = 3_000;

/**
 * `/health` is liveness only (process is up). `/health/ready` also proves the
 * PocketBase dependency answers, so orchestrators don't route traffic to an
 * API that cannot persist audits.
 */
export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/health", async () => ({
    ok: true,
    timestamp: new Date().toISOString(),
  }));

  app.get("/health/ready", async (_request, reply) => {
    const timestamp = new Date().toISOString();

    if (!hasPocketBaseConfig) {
      return reply.code(503).send({
        ok: false,
        pocketbase: "unconfigured",
        timestamp,
      });
    }

    try {
      const response = await fetch(`${env.POCKETBASE_URL}/api/health`, {
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      });

      if (!response.ok) {
        throw new Error(`PocketBase health returned ${response.status}`);
      }

      return { ok: true, pocketbase: "up", timestamp };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return reply.code(503).send({
        ok: false,
        pocketbase: "down",
        error: message,
        timestamp,
      });
    }
  });
};
