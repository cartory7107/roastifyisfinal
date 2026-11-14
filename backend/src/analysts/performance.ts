import type { CategoryAnalysis, Finding } from "@rostify/shared";

import {
  runLighthouse,
  type LighthouseMetrics,
} from "../crawler/lighthouse.js";
import { performanceScore } from "../lib/scoring.js";

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

/**
 * Performance analyst (spec §8.4) — Lighthouse on the target only.
 * On any Lighthouse failure (chrome launch, network, 60s timeout) the
 * metrics are null, the score is 0, and a single "Performance could not
 * be measured" finding is returned (spec §8.4 failure mode).
 */
export async function analyzePerformance(url: string): Promise<CategoryAnalysis> {
  let metrics: LighthouseMetrics;
  try {
    metrics = await runLighthouse(url);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    const finding: Finding = {
      severity: "critical",
      category: "performance-unmeasured",
      issue: "Performance could not be measured",
      detail: `The Lighthouse run failed, so LCP, INP, and CLS are unknown. Cause: ${reason}`,
      recommendation:
        "Verify the site is publicly reachable and Chrome can launch, then re-run the audit.",
      evidence: { reason },
    };
    return {
      score: 0,
      findings: [finding],
      summary: `Performance score 0/100 — Performance could not be measured (${reason}).`,
      metrics: {
        lcp_seconds: null,
        inp_ms: null,
        cls: null,
        tbt_ms: null,
        fcp_seconds: null,
        speed_index_seconds: null,
        inp_source: null,
        reason,
      },
    };
  }

  const { lcpSeconds, inpMs, cls } = metrics;

  // A run that produced no CWV data at all is treated as unmeasurable.
  if (lcpSeconds === null || inpMs === null || cls === null) {
    const reason = "Lighthouse reported no Core Web Vitals data";
    const finding: Finding = {
      severity: "critical",
      category: "performance-unmeasured",
      issue: "Performance could not be measured",
      detail: `The Lighthouse run completed but returned no LCP/INP/CLS values. Cause: ${reason}`,
      recommendation: "Re-run the audit; if it persists, check the page's load behavior.",
      evidence: { reason },
    };
    return {
      score: 0,
      findings: [finding],
      summary: `Performance score 0/100 — Performance could not be measured.`,
      metrics: {
        lcp_seconds: null,
        inp_ms: null,
        cls: null,
        tbt_ms: metrics.tbtMs,
        fcp_seconds: metrics.fcpSeconds,
        speed_index_seconds: metrics.speedIndexSeconds,
        inp_source: metrics.inpSource,
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
