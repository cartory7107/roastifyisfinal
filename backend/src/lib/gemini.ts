import { createPartFromBase64, GoogleGenAI } from "@google/genai";
import type { ZodType } from "zod";

import { withRetry } from "./retry.js";

const DEFAULT_MODEL = "gemini-2.5-flash";

export type GeminiErrorCode =
  | "missing_api_key"
  | "request_failed"
  | "invalid_json"
  | "schema_mismatch";

export class GeminiError extends Error {
  readonly code: GeminiErrorCode;

  constructor(code: GeminiErrorCode, message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "GeminiError";
    this.code = code;
  }
}

export function isGeminiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new GeminiError("missing_api_key", "GEMINI_API_KEY is not set");
  }
  return new GoogleGenAI({ apiKey });
}

/** One image part for a multimodal request (spec §8.9). */
export type GeminiImage = {
  base64: string;
  mimeType: string;
};

async function requestJson(
  client: GoogleGenAI,
  model: string,
  prompt: string,
  images: GeminiImage[] = [],
): Promise<string> {
  try {
    const contents =
      images.length === 0
        ? prompt
        : [
            prompt,
            ...images.map((image) =>
              createPartFromBase64(image.base64, image.mimeType),
            ),
          ];

    const response = await client.models.generateContent({
      model,
      contents,
      config: { responseMimeType: "application/json" },
    });

    const text = response.text;
    if (typeof text !== "string" || text.trim().length === 0) {
      throw new GeminiError("invalid_json", "Gemini returned an empty response");
    }
    return text;
  } catch (err) {
    if (err instanceof GeminiError) throw err;
    throw new GeminiError(
      "request_failed",
      `Gemini request failed: ${err instanceof Error ? err.message : String(err)}`,
      err,
    );
  }
}

/**
 * Ask Gemini for JSON and return it validated by `schema`.
 * Retries 3x with exponential backoff (1s, 2s, 4s) on any failure.
 */
export async function generateJson<T>(
  prompt: string,
  schema: ZodType<T>,
  images: GeminiImage[] = [],
): Promise<T> {
  const client = getClient();
  const model = process.env.GEMINI_MODEL ?? DEFAULT_MODEL;

  return withRetry(
    async () => {
      const text = await requestJson(client, model, prompt, images);

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch (err) {
        throw new GeminiError(
          "invalid_json",
          `Gemini returned non-JSON output: ${text.slice(0, 200)}`,
          err,
        );
      }

      const result = schema.safeParse(parsed);
      if (!result.success) {
        throw new GeminiError(
          "schema_mismatch",
          `Gemini output failed validation: ${result.error.message}`,
        );
      }
      return result.data;
    },
    {
      onRetry: (err, failedAttempt) => {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`[gemini] attempt ${failedAttempt} failed: ${message}`);
      },
    },
  );
}
