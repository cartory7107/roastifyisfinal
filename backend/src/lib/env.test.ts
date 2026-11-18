import { describe, expect, it } from "vitest";

import { compileOriginPattern } from "./env.js";

describe("compileOriginPattern", () => {
  it("keeps a literal origin unchanged", () => {
    expect(compileOriginPattern("https://roastifys.cartory.top")).toBe(
      "https://roastifys.cartory.top",
    );
  });

  it("matches every host on a wildcard domain, and nothing else", () => {
    const pattern = compileOriginPattern("https://*.vercel.app");
    expect(pattern).toBeInstanceOf(RegExp);

    const matches = pattern as RegExp;
    expect(matches.test("https://roastifyrs.vercel.app")).toBe(true);
    expect(matches.test("https://roastifyrs-git-main-user.vercel.app")).toBe(true);
    expect(matches.test("http://roastifyrs.vercel.app")).toBe(false);
    expect(matches.test("https://evil-vercel.app.attacker.com")).toBe(false);
    expect(matches.test("https://vercel.app.attacker.com")).toBe(false);
  });
});
