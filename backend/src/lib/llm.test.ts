import { z } from "zod";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  configuredProviders,
  estimateTokens,
  generateJson,
  isLlmConfigured,
  LlmError,
  llmModelName,
} from "./llm.js";

const chatResponse = (content: string, totalTokens = 42): Response =>
  new Response(
    JSON.stringify({
      choices: [{ message: { role: "assistant", content } }],
      usage: { total_tokens: totalTokens },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );

const Schema = z.object({ ok: z.boolean(), site: z.string() });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("configuration helpers", () => {
  it("reports the key state and the default model", () => {
    vi.stubEnv("LLM_PROVIDER", "");
    vi.stubEnv("GROQ_API_KEY", "");
    vi.stubEnv("GROQ_MODEL", "");
    vi.stubEnv("OLLAMA_API_KEY", "");
    vi.stubEnv("OLLAMA_MODEL", "");
    expect(isLlmConfigured()).toBe(false);
    expect(llmModelName()).toBe("qwen/qwen3.8-27b");

    vi.stubEnv("GROQ_API_KEY", "gsk_test");
    vi.stubEnv("GROQ_MODEL", "custom-model");
    expect(isLlmConfigured()).toBe(true);
    expect(llmModelName()).toBe("custom-model");
  });

  it("prefers Ollama in auto mode and honours explicit pins", () => {
    vi.stubEnv("LLM_PROVIDER", "");
    vi.stubEnv("GROQ_API_KEY", "gsk_test");
    vi.stubEnv("OLLAMA_API_KEY", "ollama_test");
    vi.stubEnv("OLLAMA_MODEL", "");
    expect(configuredProviders()).toEqual(["ollama", "groq"]);
    expect(llmModelName()).toBe("glm-5.3-flash");

    vi.stubEnv("LLM_PROVIDER", "groq");
    expect(configuredProviders()).toEqual(["groq"]);
    expect(llmModelName()).toBe("qwen/qwen3.8-27b");

    vi.stubEnv("LLM_PROVIDER", "ollama");
    vi.stubEnv("OLLAMA_API_KEY", "");
    expect(configuredProviders()).toEqual([]);
    expect(isLlmConfigured()).toBe(false);
  });

  it("estimates tokens including an image allowance", () => {
    const text = "x".repeat(400);
    expect(estimateTokens(text, 0)).toBeLessThan(estimateTokens(text, 1));
    expect(estimateTokens(text, 3) - estimateTokens(text, 2)).toBe(2048);
  });
});

describe("generateJson", () => {
  it("sends JSON mode without thinking and returns validated data", async () => {
    vi.stubEnv("GROQ_API_KEY", "gsk_test");
    vi.stubEnv("OLLAMA_API_KEY", "");
    const fetchMock = vi.fn(async () =>
      chatResponse('{"ok": true, "site": "example.com"}'),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateJson("audit this", Schema);

    expect(result).toEqual({ ok: true, site: "example.com" });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer gsk_test",
    );
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.model).toBe("qwen/qwen3.8-27b");
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.reasoning_effort).toBe("none");
  });

  it("strips a markdown code fence around the JSON", async () => {
    vi.stubEnv("GROQ_API_KEY", "gsk_test");
    vi.stubEnv("OLLAMA_API_KEY", "");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => chatResponse('```json\n{"ok": false, "site": "a.io"}\n```')),
    );

    await expect(generateJson("prompt", Schema)).resolves.toEqual({
      ok: false,
      site: "a.io",
    });
  });

  it("sends screenshots as image parts", async () => {
    vi.stubEnv("GROQ_API_KEY", "gsk_test");
    vi.stubEnv("OLLAMA_API_KEY", "");
    const fetchMock = vi.fn(async () => chatResponse('{"ok": true, "site": "a"}'));
    vi.stubGlobal("fetch", fetchMock);

    await generateJson("review", Schema, [
      { base64: "AAA", mimeType: "image/png" },
    ]);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const messages = (JSON.parse(String(init.body)) as { messages: { content: unknown }[] })
      .messages;
    expect(messages[0]?.content).toEqual([
      { type: "text", text: "review" },
      { type: "image_url", image_url: { url: "data:image/png;base64,AAA" } },
    ]);
  });

  it("fails without an API key", async () => {
    vi.stubEnv("LLM_PROVIDER", "");
    vi.stubEnv("GROQ_API_KEY", "");
    vi.stubEnv("OLLAMA_API_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const error = await generateJson("prompt", Schema).catch((err) => err);

    expect(error).toBeInstanceOf(LlmError);
    expect((error as LlmError).code).toBe("missing_api_key");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("calls Ollama Cloud with its own endpoint, model and token field", async () => {
    vi.stubEnv("LLM_PROVIDER", "");
    vi.stubEnv("OLLAMA_API_KEY", "ollama_test");
    vi.stubEnv("OLLAMA_MODEL", "");
    vi.stubEnv("OLLAMA_BASE_URL", "https://ollama.example.com/v1/");
    vi.stubEnv("GROQ_API_KEY", "gsk_test");
    const fetchMock = vi.fn(async () =>
      chatResponse('{"ok": true, "site": "example.com"}'),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateJson("audit this", Schema)).resolves.toEqual({
      ok: true,
      site: "example.com",
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://ollama.example.com/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer ollama_test",
    );

    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.model).toBe("glm-5.3-flash");
    expect(body.max_tokens).toBe(4096);
    expect(body.max_completion_tokens).toBeUndefined();
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.reasoning_effort).toBe("none");
  });

  it("respects a pinned provider", async () => {
    vi.stubEnv("LLM_PROVIDER", "groq");
    vi.stubEnv("GROQ_API_KEY", "gsk_test");
    vi.stubEnv("OLLAMA_API_KEY", "ollama_test");
    const fetchMock = vi.fn(async () => chatResponse('{"ok": false, "site": "b"}'));
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateJson("prompt", Schema)).resolves.toEqual({
      ok: false,
      site: "b",
    });

    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
  });

  it("falls back to the next provider when the first one rejects the key", async () => {
    vi.stubEnv("LLM_PROVIDER", "");
    vi.stubEnv("OLLAMA_API_KEY", "ollama_test");
    vi.stubEnv("GROQ_API_KEY", "gsk_test");
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes("ollama.com")) {
        return new Response(JSON.stringify({ error: "invalid api key" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        });
      }
      return chatResponse('{"ok": true, "site": "fallback.io"}');
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateJson("prompt", Schema)).resolves.toEqual({
      ok: true,
      site: "fallback.io",
    });

    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls).toHaveLength(2);
    expect(urls[0]).toBe("https://ollama.com/v1/chat/completions");
    expect(urls[1]).toBe("https://api.groq.com/openai/v1/chat/completions");
  });
});
