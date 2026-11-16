import Fastify, { type FastifyInstance } from "fastify";
import { describe, expect, it } from "vitest";

import { registerErrorHandling } from "./errors.js";

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  registerErrorHandling(app);

  app.get("/boom", async () => {
    throw new Error("connection string postgres://secret@db");
  });

  app.get("/teapot", async () => {
    throw Object.assign(new Error("I am a teapot"), { statusCode: 418 });
  });

  return app;
}

describe("registerErrorHandling", () => {
  it("answers unknown routes with a JSON 404", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/nope" });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: "Not found." });
    expect(response.json().requestId).toEqual(expect.any(String));

    await app.close();
  });

  it("masks unexpected errors and logs a request id", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/boom" });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      error: "Internal server error.",
      requestId: expect.any(String),
    });
    expect(response.body).not.toContain("postgres://secret@db");

    await app.close();
  });

  it("keeps the message for deliberate 4xx errors", async () => {
    const app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/teapot" });

    expect(response.statusCode).toBe(418);
    expect(response.json()).toMatchObject({ error: "I am a teapot" });

    await app.close();
  });
});
