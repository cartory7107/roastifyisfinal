import type {
  CategoryAnalysis,
  CategoryKey,
  Finding,
  Severity,
} from "@rostify/shared";

/**
 * Impact score (spec §8.10).
 *
 * The brief was `Search Volume x Severity`. Search volume is not available:
 * Serper returns SERPs, not volumes, and every free volume source needs an
 * account this stack does not have. Substituting an invented volume would make
 * every priority ranked below it look measured when it is guessed, so this
 * computes impact from what the audit actually measured:
 *
 *   impact = severity x category leverage x scope
 *
 * - severity  how bad the defect is on the page that was audited
 * - leverage  how much that category gates revenue for a service site
 * - scope     whether one page or the whole site is affected
 *
 * When a volume source exists, multiply `SEVERITY_WEIGHT` by volume here and
 * nothing downstream changes.
 */

const SEVERITY_WEIGHT: Record<Severity, number> = {
  critical: 10,
  high: 6,
  medium: 3,
  low: 1,
};

/** Funnel position: indexability gates everything, backlinks gate least. */
const CATEGORY_LEVERAGE: Record<CategoryKey, number> = {
  technical: 1.5,
  onpage: 1.3,
  content: 1.2,
  performance: 1.1,
  ai_readiness: 0.9,
  offpage: 0.8,
};

/**
 * Findings carry a specific `{category}-{check}` string rather than one of the
 * six category keys, so the prefix decides which leverage applies.
 */
const PREFIX_TO_CATEGORY: ReadonlyArray<readonly [string, CategoryKey]> = [
  ["robots-txt", "technical"],
  ["sitemap", "technical"],
  ["no-https", "technical"],
  ["redirect-chain", "technical"],
  ["broken-link", "technical"],
  ["meta-refresh", "technical"],
  ["crawl-incomplete", "technical"],
  ["canonical-", "technical"],
  ["noindex", "technical"],
  ["onpage-", "onpage"],
  ["content-", "content"],
  ["performance-", "performance"],
  ["offpage-", "offpage"],
];

/** Site-wide defects outrank page-scoped defects of the same severity. */
const SITE_WIDE_PREFIXES: readonly string[] = [
  "robots-txt",
  "sitemap",
  "no-https",
  "crawl-incomplete",
];
const SITE_WIDE_MULTIPLIER = 1.4;

function categoryOf(finding: Finding): CategoryKey {
  for (const [prefix, category] of PREFIX_TO_CATEGORY) {
    if (finding.category.startsWith(prefix)) return category;
  }
  return "ai_readiness";
}

function scopeMultiplier(finding: Finding): number {
  const siteWide = SITE_WIDE_PREFIXES.some((prefix) =>
    finding.category.startsWith(prefix),
  );
  return siteWide ? SITE_WIDE_MULTIPLIER : 1;
}

/** Relative impact for one finding. Not a traffic, revenue, or volume figure. */
export function impactScore(finding: Finding): number {
  const raw =
    SEVERITY_WEIGHT[finding.severity] *
    CATEGORY_LEVERAGE[categoryOf(finding)] *
    scopeMultiplier(finding);
  return Math.round(raw * 10) / 10;
}

export type RankedFinding = {
  finding: Finding;
  impact: number;
  category: CategoryKey;
};

/** Every finding across every category, highest impact first. */
export function rankFindings(
  analyses: Record<CategoryKey, CategoryAnalysis>,
): RankedFinding[] {
  const ranked: RankedFinding[] = [];

  for (const key of Object.keys(analyses) as CategoryKey[]) {
    for (const finding of analyses[key].findings) {
      ranked.push({ finding, impact: impactScore(finding), category: key });
    }
  }

  return ranked.sort((a, b) => b.impact - a.impact);
}
