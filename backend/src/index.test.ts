import { describe, expect, it } from "vitest";

import { buildServer } from "./index.js";

describe("buildServer", () => {
  it("wires the health routes and the shared error handler", async () => {
    const app = await buildServer();

    const health = await app.inject({ method: "GET", url: "/health" });
    expect(health.statusCode).toBe(200);

    const missing = await app.inject({ method: "GET", url: "/does-not-exist" });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({ error: "Not found." });
    expect(missing.json().requestId).toEqual(expect.any(String));

    await app.close();
  });

  it("returns the JSON error shape for a malformed body", async () => {
    const app = await buildServer();

    const response = await app.inject({
      method: "POST",
      url: "/audit",
      headers: { "content-type": "application/json" },
      payload: "{not json",
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: expect.any(String),
      requestId: expect.any(String),
    });

    await app.close();
  });
});
