import type { CategoryAnalysis, CrawlData, Finding } from "@rostify/shared";
import { z } from "zod";

import { generateJson, LlmError } from "../lib/llm.js";
import { prepareVisionImages, type VisionImage } from "../lib/image.js";
import { clamp } from "../lib/scoring.js";
import { buildVisionPrompt, type VisionShot } from "../prompts/vision.js";

/** Spec §8.9: neutral score used when the vision call cannot run. */
const NEUTRAL_SCORE = 50;
const MAX_FINDINGS = 5;

const SeveritySchema = z.enum(["critical", "high", "medium", "low"]);

const VisionLlmSchema = z.object({
  score: z.number(),
  findings: z
    .array(
      z.object({
        severity: SeveritySchema,
        issue: z.string(),
        detail: z.string(),
        recommendation: z.string(),
      }),
    )
    .optional(),
  summary: z.string().optional(),
});

type VisionLlmResult = z.infer<typeof VisionLlmSchema>;

type Candidate = {
  id: string;
  shot: VisionShot;
  source: string;
};

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function candidatesFor(
  target: CrawlData,
  competitors: CrawlData[],
): Candidate[] {
  const candidates: Candidate[] = [
    {
      id: "target",
      shot: { role: "target", url: target.finalUrl, title: target.title },
      source: target.screenshotMobileUrl,
    },
  ];

  competitors.forEach((competitor, index) => {
    candidates.push({
      id: `competitor-${index + 1}`,
      shot: {
        role: "competitor",
        url: competitor.finalUrl,
        title: competitor.title,
      },
      source: competitor.screenshotMobileUrl,
    });
  });

  return candidates.filter((candidate) => Boolean(candidate.source));
}

function screenshotMetrics(
  images: VisionImage[],
  candidates: Candidate[],
): Record<string, unknown>[] {
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  return images.map((image) => ({
    label: image.label,
    site: hostnameOf(byId.get(image.label)?.shot.url ?? image.source),
    width: image.width,
    height: image.height,
    resized: image.resized,
  }));
}

function unavailable(
  reason: string,
  metrics: Record<string, unknown>,
): CategoryAnalysis {
  const finding: Finding = {
    severity: "medium",
    category: "uiux-unavailable",
    issue: "Visual check temporarily unavailable — API runner limit",
    detail:
      "Temporarily Unavailable due to API Runner Limit: the screenshot comparison did not run, so no UI/UX verdict is issued. " +
      `The neutral score of ${NEUTRAL_SCORE} below is excluded from the overall score. Cause: ${reason}`,
    recommendation:
      "Re-run the audit; verify the LLM API keys (OLLAMA_API_KEY / GROQ_API_KEY) and the provider rate limit, and that screenshots uploaded successfully.",
    evidence: { reason, measurement: "unavailable" },
  };

  return {
    score: NEUTRAL_SCORE,
    measurement: "unavailable",
    measurement_reason: reason,
    findings: [finding],
    summary: `Visual analysis temporarily unavailable — the screenshot comparison could not run (API runner limit: ${reason}). Placeholder score ${NEUTRAL_SCORE} is excluded from the overall.`,
    metrics: { ...metrics, failureReason: reason },
  };
}

/**
 * Vision analyst (spec §8.9) — one multimodal LLM call comparing the target's
 * mobile screenshot with the competitors' mobile screenshots. The LLM owns the
 * whole score (0-100, clamped); no further computation.
 *
 * Failure mode: after the 3 retries inside `generateJson`, the score falls
 * back to 50 with a "Visual analysis unavailable" finding.
 */
export async function analyzeVision(
  target: CrawlData,
  competitors: CrawlData[],
): Promise<CategoryAnalysis> {
  const candidates = candidatesFor(target, competitors);
  const prepared = await prepareVisionImages(
    candidates.map((candidate) => ({
      label: candidate.id,
      source: candidate.source,
    })),
  );

  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const sentShots = prepared
    .map((image) => byId.get(image.label)?.shot)
    .filter((shot): shot is VisionShot => shot !== undefined);

  const metrics = {
    targetScreenshot: target.screenshotMobileUrl,
    imagesSent: prepared.length,
    competitorsCompared: sentShots.filter((shot) => shot.role === "competitor")
      .length,
    screenshots: screenshotMetrics(prepared, candidates),
    llmScore: null as number | null,
  };

  if (prepared.length === 0) {
    return unavailable("no screenshots could be loaded", metrics);
  }

  let llm: VisionLlmResult | null = null;
  let llmError: string | null = null;
  try {
    llm = await generateJson(
      buildVisionPrompt(sentShots),
      VisionLlmSchema,
      prepared.map((image) => ({
        base64: image.base64,
        mimeType: image.mimeType,
      })),
    );
  } catch (err) {
    llmError = err instanceof LlmError ? err.message : String(err);
    console.warn(`[vision] LLM analysis failed: ${llmError}`);
  }

  if (llm === null) {
    return unavailable(llmError ?? "vision model failed", metrics);
  }

  const score = Math.round(clamp(llm.score, 0, 100));

  const findings: Finding[] = (llm.findings ?? [])
    .slice(0, MAX_FINDINGS)
    .map((finding) => ({
      severity: finding.severity,
      category: "uiux",
      issue: finding.issue,
      detail: finding.detail,
      recommendation: finding.recommendation,
    }));

  return {
    score,
    findings,
    summary:
      llm.summary?.trim() ||
      `Visual score ${score}/100 from a mobile screenshot comparison against ${metrics.competitorsCompared} competitor(s).`,
    metrics: {
      ...metrics,
      llmScore: score,
      failureReason: null,
    },
  };
}
