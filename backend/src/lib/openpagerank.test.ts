import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchPageRank,
  isOpenPageRankConfigured,
  OpenPageRankError,
} from "./openpagerank.js";

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("isOpenPageRankConfigured", () => {
  it("is false without a key and true with one", () => {
    vi.stubEnv("OPENPAGERANK_API_KEY", "");
    expect(isOpenPageRankConfigured()).toBe(false);
    vi.stubEnv("OPENPAGERANK_API_KEY", "key");
    expect(isOpenPageRankConfigured()).toBe(true);
  });
});

describe("fetchPageRank", () => {
  it("posts domains to the bulk endpoint and maps the decimal rank", async () => {
    vi.stubEnv("OPENPAGERANK_API_KEY", "test-key");
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        results: [
          { domain: "example.com", open_page_rank: 6.7 },
          { domain: "example.org", open_page_rank: "3.25" },
          { domain: "example.net" },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const entries = await fetchPageRank([
      "example.com",
      "example.org",
      "example.net",
    ]);

    expect(entries).toEqual([
      { domain: "example.com", pageRank: 6.7 },
      { domain: "example.org", pageRank: 3.25 },
      { domain: "example.net", pageRank: null },
    ]);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://openpagerank.keywordseverywhere.com/v1/domains/bulk",
    );
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer test-key",
    );
    expect(JSON.parse(String(init.body))).toEqual({
      domains: ["example.com", "example.org", "example.net"],
      include_history: false,
    });
  });

  it("clamps out-of-range values and accepts the legacy field names", async () => {
    vi.stubEnv("OPENPAGERANK_API_KEY", "test-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          results: [
            { domain: "example.com", open_page_rank: 12 },
            { domain: "example.org", page_rank_decimal: -1 },
            { domain: "example.net", page_rank_integer: 4 },
          ],
        }),
      ),
    );

    const entries = await fetchPageRank([
      "example.com",
      "example.org",
      "example.net",
    ]);

    expect(entries.map((entry) => entry.pageRank)).toEqual([10, 0, 4]);
  });

  it("splits more than 100 domains into separate requests", async () => {
    vi.stubEnv("OPENPAGERANK_API_KEY", "test-key");
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const { domains } = JSON.parse(String(init.body)) as {
        domains: string[];
      };
      return jsonResponse({
        results: domains.map((domain) => ({
          domain,
          open_page_rank: 5,
        })),
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const domains = Array.from({ length: 150 }, (_, index) => `d${index}.com`);
    const entries = await fetchPageRank(domains);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(entries).toHaveLength(150);
    expect(entries[149]).toEqual({ domain: "d149.com", pageRank: 5 });
  });

  it("fails fast on 401 instead of retrying", async () => {
    vi.stubEnv("OPENPAGERANK_API_KEY", "bad-key");
    const fetchMock = vi.fn(async () => jsonResponse({ error: "nope" }, 401));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchPageRank(["example.com"])).rejects.toMatchObject({
      code: "request_failed",
      status: 401,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports a missing key without calling the API", async () => {
    vi.stubEnv("OPENPAGERANK_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const error = await fetchPageRank(["example.com"]).catch((err) => err);

    expect(error).toBeInstanceOf(OpenPageRankError);
    expect((error as OpenPageRankError).code).toBe("missing_api_key");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
