import type { FastifyPluginAsync } from "fastify";

// GET /health — simple liveness probe used by dev checks and the frontend
export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get("/health", async () => ({
    ok: true,
    timestamp: new Date().toISOString(),
  }));
};
