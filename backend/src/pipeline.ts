import type {
  CategoryAnalysis,
  Competitor,
  CrawlBundle,
  CrawlData,
  Niche,
} from "@rostify/shared";

import pLimit from "p-limit";

import { analyzeAiReadiness } from "./analysts/ai-readiness.js";
import { huntCompetitors } from "./analysts/competitor.js";
import { analyzeContent } from "./analysts/content.js";
import { classifyNiche, NICHE_FALLBACK } from "./analysts/niche.js";
import { analyzeOffPage } from "./analysts/off-page.js";
import { analyzeOnPage, primaryKeywordOf } from "./analysts/on-page.js";
import { analyzePerformance } from "./analysts/performance.js";
import { synthesizeReport } from "./analysts/synthesizer.js";
import { analyzeTechnical } from "./analysts/technical.js";
import { analyzeVision } from "./analysts/vision.js";
import { crawlUrl } from "./crawler/playwright.js";
import { renderReportPdf } from "./lib/pdf.js";
import {
  fetchSerpSnapshot,
  isSerperConfigured,
  type SerpSnapshot,
} from "./lib/serper.js";
import { updateAudit, fetchAudit, type AuditPatch } from "./lib/store.js";
import { env } from "./lib/env.js";

/** Caps concurrent audits so a burst of POSTs cannot spawn endless browsers. */
const auditLimiter = pLimit(env.MAX_CONCURRENT_AUDITS);

/** Hard limit per spec §5.3 — anything longer fails with 'Audit timed out'. */
const AUDIT_TIMEOUT_MS = 180_000;

function log(message: string): void {
  console.log(`[pipeline] ${message}`);
}

/**
 * Reject with 'Audit timed out' after `ms`, clearing the timer when
 * `promise` wins the race so no unhandled rejection is left behind.
 */
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("Audit timed out")), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Run one pipeline stage: mark `current_step`, run the stage, persist its
 * result. Every transition is logged (spec §18 stuck-handling item 10).
 */
async function stage<T>(
  id: string,
  step: AuditStepName,
  run: () => Promise<T> | T,
  save: (result: T) => AuditPatch,
): Promise<T> {
  log(`audit ${id}: step ${step}`);
  await updateAudit(id, { current_step: step });
  const result = await run();
  await updateAudit(id, save(result));
  log(`audit ${id}: step ${step} done`);
  return result;
}

type AuditStepName =
  | "crawl_target"
  | "technical"
  | "ai_readiness"
  | "niche"
  | "performance"
  | "onpage"
  | "competitor"
  | "crawl_competitors"
  | "content"
  | "offpage"
  | "vision"
  | "synthesize"
  | "pdf";

/** Screenshot-safe competitor label: `www.a-b.com` → `a-b.com`. */
function competitorLabel(url: string): string {
  try {
    return new URL(url).hostname
      .replace(/^www\./, "")
      .replace(/[^a-z0-9.-]/gi, "-");
  } catch {
    return "competitor";
  }
}

/**
 * Crawl the competitors in parallel (spec §13 phase 7). A competitor that
 * fails to load is dropped — content and off-page analysis still work with
 * fewer (or zero) competitors.
 */
async function crawlCompetitors(
  auditId: string,
  competitors: Competitor[],
): Promise<CrawlData[]> {
  const settled = await Promise.allSettled(
    competitors.map((competitor) =>
      crawlUrl(competitor.url, {
        auditId,
        label: competitorLabel(competitor.url),
        screenshotMode: "upload",
      }),
    ),
  );

  const pages: CrawlData[] = [];
  settled.forEach((result, index) => {
    if (result.status === "fulfilled") {
      pages.push(result.value);
      return;
    }
    const reason =
      result.reason instanceof Error ? result.reason.message : String(result.reason);
    console.warn(
      `[pipeline] competitor crawl failed for ${competitors[index]?.url ?? "unknown"}: ${reason}`,
    );
  });
  return pages;
}

/**
 * Live Google SERP for the audit's primary keyword (spec §8.3). Serper being
 * unconfigured, or the lookup failing, yields null: content analysis then
 * reports search intent as unmeasured instead of failing the audit.
 */
async function fetchSerpFor(niche: Niche): Promise<SerpSnapshot | null> {
  if (!isSerperConfigured()) return null;

  const query = primaryKeywordOf(niche);
  try {
    return await fetchSerpSnapshot(query);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[pipeline] SERP snapshot unavailable: ${message}`);
    return null;
  }
}

/** Pipeline: … → On-Page → Competitor → Competitor crawl → [Content ∥ Off-Page ∥ Vision] → Synthesizer → PDF. */
async function execute(auditId: string, startedAt: number): Promise<void> {
  const row = await fetchAudit(auditId);
  if (row === null) {
    throw new Error(`audit ${auditId} not found`);
  }

  await updateAudit(auditId, { status: "running" });

  // A — crawl the target (screenshots upload to Supabase Storage).
  const target = await stage(
    auditId,
    "crawl_target",
    () =>
      crawlUrl(row.target_url, {
        auditId,
        label: "target",
        screenshotMode: "upload",
      }),
    (data) => ({ crawl_data: { target: data, competitors: [] } satisfies CrawlBundle }),
  );

  // B — technical, ai readiness, niche, and Lighthouse are independent
  // (spec §5.2/§8.4). Niche never throws (falls back), and the analysts —
  // including the performance analyst's failure mode — catch their own errors.
  let niche: Niche = NICHE_FALLBACK;
  const [technical, aiReadiness, , performance] = await Promise.all([
    stage(
      auditId,
      "technical",
      () => analyzeTechnical(target),
      (analysis: CategoryAnalysis) => ({ technical_analysis: analysis }),
    ),
    stage(
      auditId,
      "ai_readiness",
      () => analyzeAiReadiness(target),
      (analysis: CategoryAnalysis) => ({ ai_readiness_analysis: analysis }),
    ),
    stage(
      auditId,
      "niche",
      () => classifyNiche(target),
      (result) => ({ niche: result }),
    ).then((result) => {
      niche = result;
      return result;
    }),
    stage(
      auditId,
      "performance",
      () => analyzePerformance(row.target_url),
      (analysis: CategoryAnalysis) => ({ performance_analysis: analysis }),
    ),
  ]);

  // C — on-page depends on the niche's primary keyword (spec §8.2).
  const onpage = await stage(
    auditId,
    "onpage",
    () => analyzeOnPage(target, niche),
    (analysis: CategoryAnalysis) => ({ onpage_analysis: analysis }),
  );

  // D — competitor hunt (Serper): degrades to [] on failure, never throws.
  const competitors = await stage(
    auditId,
    "competitor",
    () => huntCompetitors(niche, row.target_url),
    (list) => ({ competitors: list }),
  );

  // E — crawl each competitor in parallel and, independently, pull the live
  // SERP for the audit's primary keyword. The SERP never blocks the crawl and
  // degrades to null, so a Serper outage costs the intent check only.
  const [competitorPages, serp] = await Promise.all([
    stage(
      auditId,
      "crawl_competitors",
      () => crawlCompetitors(auditId, competitors),
      (pages) => ({
        crawl_data: { target, competitors: pages } satisfies CrawlBundle,
      }),
    ),
    fetchSerpFor(niche),
  ]);

  // F — content, off-page and vision are independent (spec §5.2 stages E2/E3
  // plus the vision sub-step of §8.9).
  const [content, offpage] = await Promise.all([
    stage(
      auditId,
      "content",
      () => analyzeContent(target, competitorPages, niche, serp),
      (analysis: CategoryAnalysis) => ({ content_analysis: analysis }),
    ),
    stage(
      auditId,
      "offpage",
      () => analyzeOffPage(row.target_url, competitors),
      (analysis: CategoryAnalysis) => ({ offpage_analysis: analysis }),
    ),
    stage(
      auditId,
      "vision",
      () => analyzeVision(target, competitorPages),
      (analysis: CategoryAnalysis) => ({ uiux_analysis: analysis }),
    ),
  ]);

  // G — synthesizer: scores and grade are computed in code; the LLM only
  // writes the summary and priorities (spec §8.10). The FinalReport is
  // persisted as `final_report` before the audit is marked completed.
  await stage(
    auditId,
    "synthesize",
    () =>
      synthesizeReport({
        niche,
        target,
        competitors,
        competitorPages,
        analyses: {
          technical,
          onpage,
          content,
          performance,
          offpage,
          ai_readiness: aiReadiness,
        },
        auditedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
      }),
    (finalReport) => ({ final_report: finalReport }),
  );

  // H — PDF of the print view (spec §13, phase 11). The report is already
  // persisted, so a render/upload failure is logged and the audit still
  // completes: the UI falls back to the browser's print view.
  await stage(
    auditId,
    "pdf",
    async () => {
      try {
        return await renderReportPdf(auditId);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`[pipeline] pdf unavailable for ${auditId}: ${message}`);
        return null;
      }
    },
    (pdfUrl) => (pdfUrl === null ? {} : { pdf_url: pdfUrl }),
  );
}

/**
 * Fire-and-forget entry point called by POST /audit (spec §10):
 * the route returns immediately, this runs the pipeline detached.
 * Marks the audit completed when the phase-5 stages finish (later
 * phases extend `execute`), or failed with the error message.
 */
export function startAudit(auditId: string): void {
  setImmediate(() => {
    // `runAudit` never rejects (it records failures on the audit row), so the
    // limiter queue cannot accumulate unhandled rejections.
    void auditLimiter(() => runAudit(auditId));
  });
}

/** Awaitable variant of the pipeline, used by the demo rehearsal script. */
export async function runAudit(auditId: string): Promise<void> {
  const startedAt = Date.now();
  log(`audit ${auditId} started`);

  try {
    await withTimeout(execute(auditId, startedAt), AUDIT_TIMEOUT_MS);
    await updateAudit(auditId, {
      status: "completed",
      current_step: null,
      completed_at: new Date().toISOString(),
    });
    log(`audit ${auditId} completed in ${Date.now() - startedAt}ms`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`audit ${auditId} failed after ${Date.now() - startedAt}ms: ${message}`);
    try {
      await updateAudit(auditId, {
        status: "failed",
        error_message: message,
        completed_at: new Date().toISOString(),
      });
    } catch (storeErr) {
      // The row could not be marked failed (e.g. Supabase outage) — log it
      // so `current_step` inspection can still explain the stall (§18.10).
      console.error(`[pipeline] could not mark ${auditId} failed:`, storeErr);
    }
  }
}
