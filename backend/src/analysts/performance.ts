import type { CategoryAnalysis, Finding } from "@rostify/shared";

import { hasDatabase } from "../lib/db.js";
import { env } from "../lib/env.js";
import type { LighthouseMetrics } from "../lib/lighthouse-metrics.js";
import { psiSnapshot } from "../lib/psi.js";
import {
  clsScore,
  lcpScore,
  performanceScore,
} from "../lib/scoring.js";

/**
 * A TBT proxy reading above this is treated as an anomalous run (layout
 * thrash in the headless runner, a hung request, a broken load) rather than a
 * definitive INP penalty: it is reported as unmeasured instead of scored.
 */
const TBT_PROXY_ANOMALY_MS = 8_000;

/**
 * Severity thresholds (spec §8.4 findings): LCP > 4.0s critical,
 * > 2.5s high; INP > 500ms critical, > 200ms high; CLS > 0.25 high,
 * > 0.10 medium.
 */
function cwvFindings(m: LighthouseMetrics): Finding[] {
  const findings: Finding[] = [];

  if (m.lcpSeconds !== null && m.lcpSeconds > 2.5) {
    findings.push({
      severity: m.lcpSeconds > 4.0 ? "critical" : "high",
      category: "performance-lcp",
      issue: `LCP is ${m.lcpSeconds.toFixed(1)}s (target ≤ 2.5s)`,
      detail:
        "The largest content element takes too long to appear, which is what users perceive as the page load time.",
      recommendation:
        "Preload the LCP image, server-render the hero content, and remove render-blocking CSS/JS.",
      evidence: { lcp_seconds: Number(m.lcpSeconds.toFixed(2)), threshold: 2.5 },
    });
  }

  if (m.inpMs !== null && m.inpMs > 200) {
    findings.push({
      severity: m.inpMs > 500 ? "critical" : "high",
      category: "performance-inp",
      issue: `${m.inpSource === "tbt" ? "TBT (INP proxy)" : "INP"} is ${Math.round(m.inpMs)}ms (target ≤ 200ms)`,
      detail:
        m.inpSource === "tbt"
          ? "The INP audit was unavailable, so total blocking time is reported as its proxy; long main-thread work delays interaction feedback."
          : "Interactions take too long to produce visible feedback after the tap or click.",
      recommendation:
        "Break up long tasks, defer third-party scripts, and reduce JavaScript executed on startup.",
      evidence: {
        inp_ms: Math.round(m.inpMs),
        source: m.inpSource,
        threshold: 200,
      },
    });
  }

  if (m.cls !== null && m.cls > 0.1) {
    findings.push({
      severity: m.cls > 0.25 ? "high" : "medium",
      category: "performance-cls",
      issue: `CLS is ${m.cls.toFixed(2)} (target ≤ 0.10)`,
      detail:
        "Visible elements shift during load because space is not reserved for images, ads, or injected content.",
      recommendation:
        "Set width/height or aspect-ratio on media, reserve ad slots, and avoid inserting content above existing content.",
      evidence: { cls: Number(m.cls.toFixed(3)), threshold: 0.1 },
    });
  }

  return findings;
}

function summaryFor(score: number, findings: Finding[]): string {
  const head = `Performance score ${score}/100 (mobile, Lighthouse).`;
  if (findings.length === 0) {
    return `${head} Core Web Vitals pass on all three metrics.`;
  }
  const priorities = findings.map((f) => f.issue).join("; ");
  return `${head} Needs attention: ${priorities}.`;
}

function unavailable(
  reason: string,
  metrics: Record<string, unknown>,
): CategoryAnalysis {
  const finding: Finding = {
    severity: "medium",
    category: "performance-unmeasured",
    issue: "Performance check temporarily unavailable — runner limit",
    detail:
      "Temporarily Unavailable due to API Runner Limit: the Lighthouse run did not produce data, so LCP, INP and CLS are unknown and no performance verdict is issued. " +
      "The placeholder score below is excluded from the overall score. Cause: " +
      reason,
    recommendation:
      "Verify the site is publicly reachable, then re-run the audit. In serverless mode add a free PSI_API_KEY to raise the PageSpeed Insights quota.",
    evidence: { reason, measurement: "unavailable" },
  };
  return {
    score: 0,
    measurement: "unavailable",
    measurement_reason: reason,
    findings: [finding],
    summary: `Performance temporarily unavailable — the Lighthouse run failed (${reason}). Placeholder score is excluded from the overall.`,
    metrics,
  };
}

/**
 * PageSpeed Insights in serverless mode (no Chromium), local Lighthouse
 * otherwise. `auto` picks PSI whenever Postgres/serverless mode is active.
 */
async function measure(url: string): Promise<LighthouseMetrics> {
  const usePsi =
    env.PERFORMANCE_PROVIDER === "psi" ||
    (env.PERFORMANCE_PROVIDER === "auto" && hasDatabase);

  if (usePsi) {
    return (await psiSnapshot(url, "mobile")).metrics;
  }

  const { runLighthouse } = await import("../crawler/lighthouse.js");
  return runLighthouse(url);
}

/**
 * Performance analyst (spec §8.4) — Lighthouse on the target only.
 * On any Lighthouse failure (chrome launch, network, 60s timeout) the metrics
 * are unknown: the category is marked unavailable and EXCLUDED from the
 * overall score rather than presented as a 0/100 penalty.
 */
export async function analyzePerformance(url: string): Promise<CategoryAnalysis> {
  let metrics: LighthouseMetrics;
  try {
    metrics = await measure(url);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return unavailable(reason, {
      lcp_seconds: null,
      inp_ms: null,
      cls: null,
      tbt_ms: null,
      fcp_seconds: null,
      speed_index_seconds: null,
      inp_source: null,
      reason,
    });
  }

  const { lcpSeconds, inpMs, cls } = metrics;

  // A run that produced no CWV data at all is treated as unmeasurable.
  if (lcpSeconds === null || inpMs === null || cls === null) {
    const reason = "Lighthouse reported no Core Web Vitals data";
    return unavailable(reason, {
      lcp_seconds: null,
      inp_ms: null,
      cls: null,
      tbt_ms: metrics.tbtMs === null ? null : Math.round(metrics.tbtMs),
      fcp_seconds:
        metrics.fcpSeconds === null ? null : Number(metrics.fcpSeconds.toFixed(2)),
      speed_index_seconds:
        metrics.speedIndexSeconds === null
          ? null
          : Number(metrics.speedIndexSeconds.toFixed(2)),
      inp_source: metrics.inpSource,
      reason,
    });
  }

  // An absurd TBT proxy reading (12,000ms+) is an anomalous runner run, not a
  // measured interaction delay: exclude it instead of penalizing definitively.
  if (metrics.inpSource === "tbt" && inpMs >= TBT_PROXY_ANOMALY_MS) {
    const reason = `TBT proxy reading is anomalous (${Math.round(inpMs)}ms ≥ ${TBT_PROXY_ANOMALY_MS}ms threshold)`;
    const renormalized = Math.round(
      (0.4 * lcpScore(lcpSeconds) + 0.3 * clsScore(cls)) / 0.7,
    );
    const finding: Finding = {
      severity: "low",
      category: "performance-tbt-anomaly",
      issue: `TBT reading anomalous (${Math.round(inpMs)}ms) — excluded from scoring`,
      detail:
        "Temporarily Unavailable due to API Runner Limit: the headless runner's total blocking time is far outside plausible range, so it is treated as unmeasured rather than a definitive INP penalty. " +
        "The performance score is renormalized from the measured LCP and CLS only.",
      recommendation:
        "Re-run the audit; if the anomaly persists, measure INP with real interaction data in PageSpeed Insights.",
      evidence: {
        tbt_ms: Math.round(inpMs),
        anomaly_threshold_ms: TBT_PROXY_ANOMALY_MS,
        measurement: "unavailable",
      },
    };
    return {
      score: renormalized,
      findings: [
        finding,
        ...cwvFindings({ ...metrics, inpMs: null, inpSource: null }),
      ],
      summary: `Performance score ${renormalized}/100 from LCP and CLS only — ${reason}.`,
      metrics: {
        lcp_seconds: Number(lcpSeconds.toFixed(2)),
        inp_ms: null,
        cls: Number(cls.toFixed(3)),
        tbt_ms: Math.round(metrics.tbtMs ?? inpMs),
        fcp_seconds:
          metrics.fcpSeconds === null ? null : Number(metrics.fcpSeconds.toFixed(2)),
        speed_index_seconds:
          metrics.speedIndexSeconds === null
            ? null
            : Number(metrics.speedIndexSeconds.toFixed(2)),
        inp_source: "unmeasured_anomaly",
        reason,
      },
    };
  }

  const score = Math.round(performanceScore(lcpSeconds, inpMs, cls));
  const findings = cwvFindings(metrics);

  return {
    score,
    findings,
    summary: summaryFor(score, findings),
    metrics: {
      lcp_seconds: Number(lcpSeconds.toFixed(2)),
      inp_ms: Math.round(inpMs),
      cls: Number(cls.toFixed(3)),
      tbt_ms: metrics.tbtMs === null ? null : Math.round(metrics.tbtMs),
      fcp_seconds:
        metrics.fcpSeconds === null
          ? null
          : Number(metrics.fcpSeconds.toFixed(2)),
      speed_index_seconds:
        metrics.speedIndexSeconds === null
          ? null
          : Number(metrics.speedIndexSeconds.toFixed(2)),
      inp_source: metrics.inpSource,
    },
  };
}
