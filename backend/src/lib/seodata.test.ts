import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearKeywordCache,
  isSeoDataConfigured,
  lookupKeyword,
  lookupKeywords,
  SeoDataError,
} from "./seodata.js";

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

afterEach(() => {
  clearKeywordCache();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("isSeoDataConfigured", () => {
  it("is false without a key and true with one", () => {
    vi.stubEnv("SEODATA_API_KEY", "");
    expect(isSeoDataConfigured()).toBe(false);
    vi.stubEnv("SEODATA_API_KEY", "sd_live_test");
    expect(isSeoDataConfigured()).toBe(true);
  });
});

describe("lookupKeyword", () => {
  it("requests the keyword for the given country and maps the metrics", async () => {
    vi.stubEnv("SEODATA_API_KEY", "sd_live_test");
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        keyword: "headless cms",
        volume: 4400,
        cpc: 25.24,
        competition: 0.62,
        country: "us",
        cached: false,
        similar: [
          { keyword: "cms headless", volume: 4400, cpc: 24.06, overlap: 20 },
          { keyword: "what is headless cms", volume: 1300, cpc: 11.5, overlap: 20 },
          { keyword: "  ", volume: 10, cpc: 1, overlap: 3 },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const metric = await lookupKeyword("headless cms", { country: "GB" });

    expect(metric).toEqual({
      keyword: "headless cms",
      volume: 4400,
      cpc: 25.24,
      competition: 0.62,
      similar: [
        { keyword: "cms headless", volume: 4400, cpc: 24.06, overlap: 20 },
        { keyword: "what is headless cms", volume: 1300, cpc: 11.5, overlap: 20 },
      ],
    });

    const [url, init] = fetchMock.mock.calls[0] as [string | URL, RequestInit];
    const parsed = new URL(String(url));
    expect(parsed.origin + parsed.pathname).toBe("https://api.seodata.dev/v1/keyword");
    expect(parsed.searchParams.get("q")).toBe("headless cms");
    expect(parsed.searchParams.get("country")).toBe("gb");
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer sd_live_test",
    );
  });

  it("omits the Authorization header when no key is set", async () => {
    vi.stubEnv("SEODATA_API_KEY", "");
    const fetchMock = vi.fn(async () =>
      jsonResponse({ keyword: "seo", volume: 100, cpc: 1, competition: 0.1 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const metric = await lookupKeyword("seo");

    expect(metric.volume).toBe(100);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    expect(new URL(String((fetchMock.mock.calls[0] as [string])[0])).searchParams.get("country")).toBe(
      "us",
    );
  });

  it("fills missing metrics with null", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ keyword: "seo" })));

    const metric = await lookupKeyword("seo");

    expect(metric).toEqual({
      keyword: "seo",
      volume: null,
      cpc: null,
      competition: null,
      similar: [],
    });
  });

  it("surfaces a 401 without retrying", async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ error: "bad key" }, 401));
    vi.stubGlobal("fetch", fetchMock);

    await expect(lookupKeyword("seo")).rejects.toBeInstanceOf(SeoDataError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports quota exhaustion as rate_limited", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ error: "quota" }, 429)));

    await expect(lookupKeyword("seo")).rejects.toMatchObject({ code: "rate_limited" });
  });

  it("serves a repeated lookup from the local cache without spending quota", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ keyword: "seo", volume: 100, cpc: 1, competition: 0.1 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await lookupKeyword("seo");
    await lookupKeyword("SEO", { country: "US" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("lookupKeywords", () => {
  it("keeps successful keywords and reports the failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const query = new URL(String(input)).searchParams.get("q");
        if (query === "blocked") return jsonResponse({ error: "quota" }, 429);
        return jsonResponse({ keyword: query, volume: 10, cpc: 1, competition: 0.2 });
      }),
    );

    const result = await lookupKeywords(["one", "blocked", "two"]);

    expect(result.metrics.map((metric) => metric.keyword)).toEqual(["one", "two"]);
    expect(result.failures).toEqual(["rate_limited"]);
  });
});
