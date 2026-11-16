import Fastify, { type FastifyInstance } from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class BlockedUrlError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "BlockedUrlError";
    }
  }

  // Mirrors the protocol rule of the real guard; DNS checks belong to its own
  // test file, so the route tests never touch the network.
  const defaultAssertPublicUrl = async (raw: string): Promise<URL> => {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new BlockedUrlError("URL must use http or https.");
    }
    return url;
  };

  return {
    isPocketBaseConfigured: vi.fn(() => true),
    insertAudit: vi.fn(async () => "rec000000000001"),
    fetchAudit: vi.fn(),
    startAudit: vi.fn(),
    assertPublicUrl: vi.fn(defaultAssertPublicUrl),
    defaultAssertPublicUrl,
    BlockedUrlError,
  };
});

vi.mock("../lib/pb.js", () => ({
  AUDITS_COLLECTION: "audits",
  isPocketBaseConfigured: mocks.isPocketBaseConfigured,
  getPocketBase: vi.fn(),
}));

vi.mock("../lib/store.js", () => ({
  insertAudit: mocks.insertAudit,
  fetchAudit: mocks.fetchAudit,
}));

vi.mock("../pipeline.js", () => ({ startAudit: mocks.startAudit }));

vi.mock("../lib/url-guard.js", () => ({
  assertPublicUrl: mocks.assertPublicUrl,
  BlockedUrlError: mocks.BlockedUrlError,
}));

const { auditRoutes } = await import("./audit.js");

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(auditRoutes);
  return app;
}

beforeEach(() => {
  mocks.isPocketBaseConfigured.mockReturnValue(true);
  mocks.insertAudit.mockResolvedValue("rec000000000001");
  mocks.assertPublicUrl.mockReset();
  mocks.assertPublicUrl.mockImplementation(mocks.defaultAssertPublicUrl);
});

describe("POST /audit", () => {
  it("accepts a valid url and starts the pipeline", async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/audit",
      payload: { url: "https://example.com" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      auditId: "rec000000000001",
      status: "running",
    });
    expect(mocks.insertAudit).toHaveBeenCalledWith("https://example.com");
    expect(mocks.startAudit).toHaveBeenCalledWith("rec000000000001");

    await app.close();
  });

  it("rejects a body without a url", async () => {
    const app = await buildApp();

    const response = await app.inject({ method: "POST", url: "/audit", payload: {} });

    expect(response.statusCode).toBe(400);
    expect(mocks.insertAudit).not.toHaveBeenCalled();

    await app.close();
  });

  it("rejects a non-http scheme", async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/audit",
      payload: { url: "ftp://example.com/file.txt" },
    });

    expect(response.statusCode).toBe(400);
    expect(mocks.insertAudit).not.toHaveBeenCalled();

    await app.close();
  });

  it("returns 400 with the guard message for a blocked url", async () => {
    const app = await buildApp();
    mocks.assertPublicUrl.mockRejectedValueOnce(
      new mocks.BlockedUrlError("URL host must be a public address."),
    );

    const response = await app.inject({
      method: "POST",
      url: "/audit",
      payload: { url: "http://169.254.169.254/latest/meta-data/" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "URL host must be a public address." });
    expect(mocks.insertAudit).not.toHaveBeenCalled();

    await app.close();
  });

  it("returns 503 when PocketBase is not configured", async () => {
    mocks.isPocketBaseConfigured.mockReturnValue(false);
    const app = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/audit",
      payload: { url: "https://example.com" },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toHaveProperty("error");

    await app.close();
  });

  it("returns 500 when the insert fails", async () => {
    mocks.insertAudit.mockRejectedValueOnce(new Error("store down"));
    const app = await buildApp();

    const response = await app.inject({
      method: "POST",
      url: "/audit",
      payload: { url: "https://example.com" },
    });

    expect(response.statusCode).toBe(500);
    expect(mocks.startAudit).not.toHaveBeenCalled();

    await app.close();
  });
});

describe("GET /audit/:id", () => {
  it("returns the poll payload", async () => {
    mocks.fetchAudit.mockResolvedValueOnce({
      id: "rec000000000001",
      status: "completed",
      current_step: null,
      target_url: "https://example.com",
      crawl_data: null,
      final_report: null,
      error_message: null,
      uiux_analysis: null,
      pdf_url: null,
    });
    const app = await buildApp();

    const response = await app.inject({ method: "GET", url: "/audit/rec000000000001" });
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body).toMatchObject({
      id: "rec000000000001",
      status: "completed",
      currentStep: null,
      targetUrl: "https://example.com",
      page: null,
    });

    await app.close();
  });

  it("returns 404 for an unknown id", async () => {
    mocks.fetchAudit.mockResolvedValueOnce(null);
    const app = await buildApp();

    const response = await app.inject({ method: "GET", url: "/audit/rec000000000002" });

    expect(response.statusCode).toBe(404);

    await app.close();
  });

  it("rejects an id with illegal characters", async () => {
    const app = await buildApp();

    const response = await app.inject({ method: "GET", url: "/audit/bad%20id!" });

    expect(response.statusCode).toBe(400);

    await app.close();
  });
});
