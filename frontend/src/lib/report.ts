import type {
  CategoryAnalysis,
  CategoryKey,
  FinalReport,
  Finding,
  Severity,
} from "@rostify/shared";

export const CATEGORY_ORDER: CategoryKey[] = [
  "technical",
  "onpage",
  "content",
  "performance",
  "offpage",
  "ai_readiness",
];

export const CATEGORY_META: Record<
  CategoryKey,
  { label: string; anchor: string; blurb: string }
> = {
  technical: {
    label: "Technical SEO",
    anchor: "technical",
    blurb: "Crawlability, indexation, canonicals and link health.",
  },
  onpage: {
    label: "On-Page SEO",
    anchor: "onpage",
    blurb: "Title, meta, headings, keyword use and internal links.",
  },
  content: {
    label: "Content & E-E-A-T",
    anchor: "content",
    blurb: "Depth, freshness, duplication and topical coverage.",
  },
  performance: {
    label: "Performance",
    anchor: "performance",
    blurb: "Core Web Vitals measured with Lighthouse.",
  },
  offpage: {
    label: "Off-Page Authority",
    anchor: "offpage",
    blurb: "Domain authority versus the competitors that outrank you.",
  },
  ai_readiness: {
    label: "AI Readiness",
    anchor: "ai_readiness",
    blurb: "Structured data, llms.txt and AI crawler access.",
  },
};

/** Category weights for the overall score (spec §9.7, sum = 1.00). */
export const CATEGORY_WEIGHT: Record<CategoryKey, number> = {
  technical: 0.2,
  onpage: 0.2,
  content: 0.2,
  performance: 0.15,
  offpage: 0.1,
  ai_readiness: 0.15,
};

export type ScoreBand = {
  label: string;
  stroke: string;
  text: string;
  bg: string;
  border: string;
  bar: string;
};

/** Spec §11: ≥80 green, 60-79 amber, <60 red. */
export function scoreBand(score: number): ScoreBand {
  if (score >= 80) {
    return {
      label: "Good",
      stroke: "#10b981",
      text: "text-emerald-700",
      bg: "bg-emerald-50",
      border: "border-emerald-200",
      bar: "bg-emerald-500",
    };
  }
  if (score >= 60) {
    return {
      label: "Needs work",
      stroke: "#f59e0b",
      text: "text-amber-700",
      bg: "bg-amber-50",
      border: "border-amber-200",
      bar: "bg-amber-500",
    };
  }
  return {
    label: "Critical",
    stroke: "#ef4444",
    text: "text-red-700",
    bg: "bg-red-50",
    border: "border-red-200",
    bar: "bg-red-500",
  };
}

export const SEVERITY_META: Record<
  Severity,
  { label: string; rank: number; badge: string; dot: string; accent: string }
> = {
  critical: {
    label: "Critical",
    rank: 0,
    badge: "bg-red-50 text-red-700 border-red-200",
    dot: "bg-red-500",
    accent: "border-l-red-500",
  },
  high: {
    label: "High",
    rank: 1,
    badge: "bg-orange-50 text-orange-700 border-orange-200",
    dot: "bg-orange-500",
    accent: "border-l-orange-500",
  },
  medium: {
    label: "Medium",
    rank: 2,
    badge: "bg-amber-50 text-amber-700 border-amber-200",
    dot: "bg-amber-500",
    accent: "border-l-amber-500",
  },
  low: {
    label: "Low",
    rank: 3,
    badge: "bg-slate-50 text-slate-600 border-slate-200",
    dot: "bg-slate-400",
    accent: "border-l-slate-300",
  },
};

/* ---------- Safe readers for `Record<string, unknown>` metrics ---------- */

export function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

export function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function asStringArray(value: unknown): string[] {
  return asArray(value).filter((entry): entry is string => typeof entry === "string");
}

export function metric(
  analysis: CategoryAnalysis,
  key: string,
): unknown {
  return analysis.metrics[key];
}

export function humanize(token: string): string {
  const words = token.replace(/[_-]+/g, " ").trim();
  if (words === "") return token;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    const delta = SEVERITY_META[a.severity].rank - SEVERITY_META[b.severity].rank;
    return delta !== 0 ? delta : a.issue.localeCompare(b.issue);
  });
}

export function countBySeverity(findings: Finding[]) {
  return findings.reduce(
    (acc, finding) => {
      acc[finding.severity] += 1;
      return acc;
    },
    { critical: 0, high: 0, medium: 0, low: 0 } as Record<Severity, number>,
  );
}

/* ---------- Report-level helpers ---------- */

export type Priority = { title: string; category: string; why: string };

/**
 * The synthesizer returns up to three priorities, but it runs on an LLM that can
 * fail (spec §8.10 fallback is an empty list). Rather than render an empty
 * "top priorities" section, fall back to the highest-severity findings in the
 * lowest-scoring categories — the same order an auditor would triage in.
 */
export function derivePriorities(report: FinalReport): Priority[] {
  const priorities: Priority[] = report.top_priorities
    .slice(0, 3)
    .map((priority) => ({ ...priority }));
  if (priorities.length >= 3) return priorities;

  const seen = new Set(priorities.map((priority) => priority.title.toLowerCase()));

  const candidates = [...CATEGORY_ORDER]
    .sort(
      (a, b) =>
        report.category_scores[a].score - report.category_scores[b].score,
    )
    .flatMap((key) =>
      sortFindings(report.category_scores[key].findings).map((finding) => ({
        finding,
        category: CATEGORY_META[key].label,
      })),
    );

  for (const { finding, category } of candidates) {
    if (priorities.length >= 3) break;
    const title = finding.issue.trim();
    if (title === "" || seen.has(title.toLowerCase())) continue;
    seen.add(title.toLowerCase());
    priorities.push({ title, category, why: finding.detail });
  }

  return priorities;
}

export function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function pathOf(url: string): string {
  try {
    const parsed = new URL(url);
    const path = `${parsed.pathname}${parsed.search}`;
    return path === "/" ? "" : path;
  } catch {
    return "";
  }
}

export function formatAuditedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

export function categoryLabel(category: string): string {
  const match = CATEGORY_ORDER.find(
    (key) =>
      CATEGORY_META[key].label.toLowerCase() === category.toLowerCase() ||
      key === category,
  );
  if (match) return CATEGORY_META[match].label;
  return humanize(category);
}

/** Total findings across the six scored categories plus the vision review. */
export function totalFindings(
  report: FinalReport,
  uiux: CategoryAnalysis | null,
): number {
  const scored = CATEGORY_ORDER.reduce(
    (sum, key) => sum + report.category_scores[key].findings.length,
    0,
  );
  return scored + (uiux?.findings.length ?? 0);
}
