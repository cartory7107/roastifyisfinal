import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

/** `env` is resolved at import time, so each case re-imports the plugin. */
async function buildHealthApp(): Promise<FastifyInstance> {
  vi.resetModules();
  const { healthRoutes } = await import("./health.js");
  const app = Fastify();
  await app.register(healthRoutes);
  return app;
}

function clearPocketBaseEnv(): void {
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("POCKETBASE_URL", "");
  vi.stubEnv("POCKETBASE_ADMIN_EMAIL", "");
  vi.stubEnv("POCKETBASE_ADMIN_PASSWORD", "");
}

function setPocketBaseEnv(): void {
  vi.stubEnv("POCKETBASE_URL", "http://pocketbase.test");
  vi.stubEnv("POCKETBASE_ADMIN_EMAIL", "admin@example.com");
  vi.stubEnv("POCKETBASE_ADMIN_PASSWORD", "secret");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.doUnmock("../lib/db.js");
});

describe("GET /health", () => {
  it("reports liveness", async () => {
    clearPocketBaseEnv();
    const app = await buildHealthApp();

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true });

    await app.close();
  });
});

describe("GET /health/ready", () => {
  it("is 503 when no store is configured", async () => {
    clearPocketBaseEnv();
    const app = await buildHealthApp();

    const response = await app.inject({ method: "GET", url: "/health/ready" });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ ok: false, store: "unconfigured" });

    await app.close();
  });

  it("is 200 when Postgres answers", async () => {
    vi.resetModules();
    const query = vi.fn(async () => ({ rows: [{ ok: 1 }] }));
    vi.doMock("../lib/db.js", () => ({
      hasDatabase: true,
      getPool: () => ({ query }),
    }));

    const { healthRoutes } = await import("./health.js");
    const app = Fastify();
    await app.register(healthRoutes);

    const response = await app.inject({ method: "GET", url: "/health/ready" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true, database: "up" });
    expect(query).toHaveBeenCalled();

    await app.close();
    vi.doUnmock("../lib/db.js");
  });

  it("is 200 when PocketBase answers", async () => {
    setPocketBaseEnv();
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const app = await buildHealthApp();
    const response = await app.inject({ method: "GET", url: "/health/ready" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true, pocketbase: "up" });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://pocketbase.test/api/health",
      expect.objectContaining({ signal: expect.anything() }),
    );

    await app.close();
  });

  it("is 503 when PocketBase is unreachable", async () => {
    setPocketBaseEnv();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("connect ECONNREFUSED");
      }),
    );

    const app = await buildHealthApp();
    const response = await app.inject({ method: "GET", url: "/health/ready" });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ ok: false, pocketbase: "down" });

    await app.close();
  });
});
