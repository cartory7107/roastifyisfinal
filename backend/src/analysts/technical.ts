import { XMLParser } from "fast-xml-parser";

import type { CategoryAnalysis, CrawlData, Finding } from "@rostify/shared";
import { checkBrokenLinks, type BrokenLink } from "../crawler/broken-links.js";
import { sortBySeverity } from "../lib/findings.js";
import { robotsParser } from "../lib/robots.js";
import { technicalScore, type TechnicalChecks } from "../lib/scoring.js";

const BROKEN_LINK_SAMPLE = 10;
const BROKEN_LINK_RATIO_LIMIT = 0.1;
const ROBOTS_PREVIEW_LIMIT = 2_000;

/**
 * Normalize a URL for canonical comparison: drop fragments, collapse the
 * trailing slash, lowercase the host. Path case is preserved because it is
 * significant.
 */
function normalizeForCompare(input: string): string | null {
  try {
    const parsed = new URL(input);
    const pathname = parsed.pathname.replace(/\/+$/, "") || "/";
    return `${parsed.origin.toLowerCase()}${pathname}${parsed.search}`;
  } catch {
    return null;
  }
}

function isRobotsTxtValid(robotsTxt: string, robotsUrl: string): boolean {
  // An empty robots.txt is a valid "allow everything" file.
  if (robotsTxt.trim().length === 0) return true;
  if (!/^\s*user-agent\s*:/im.test(robotsTxt)) return false;

  try {
    robotsParser(robotsUrl, robotsTxt);
    return true;
  } catch {
    return false;
  }
}

function isSitemapXmlValid(xml: string): boolean {
  if (xml.trim().length === 0) return false;

  try {
    const parsed: unknown = new XMLParser({
      ignoreAttributes: true,
      processEntities: false,
      allowBooleanAttributes: true,
    }).parse(xml);

    if (parsed === null || typeof parsed !== "object") return false;

    const root = parsed as Record<string, unknown>;
    return "urlset" in root || "sitemapindex" in root;
  } catch {
    return false;
  }
}

function buildSummary(
  score: number,
  passedChecks: number,
  findings: Finding[],
): string {
  const head = `Technical score ${score}/100 with ${passedChecks}/8 core checks passing.`;

  if (findings.length === 0) {
    return `${head} Crawlability and indexation configuration look clean.`;
  }

  const priorities = findings
    .slice(0, 3)
    .map((finding) => finding.issue.toLowerCase())
    .join(", ");

  return `${head} Highest-impact fixes: ${priorities}.`;
}

export async function analyzeTechnical(
  data: CrawlData,
): Promise<CategoryAnalysis> {
  const origin = new URL(data.finalUrl).origin;
  const robotsUrl = `${origin}/robots.txt`;

  const robotsExists = data.robotsTxt !== null;
  const robotsValid =
    data.robotsTxt !== null && isRobotsTxtValid(data.robotsTxt, robotsUrl);

  const sitemapExists = data.sitemapXml !== null;
  const sitemapValid =
    data.sitemapXml !== null && isSitemapXmlValid(data.sitemapXml);

  const normalizedCanonical =
    data.canonical !== null ? normalizeForCompare(data.canonical) : null;
  const normalizedFinalUrl = normalizeForCompare(data.finalUrl);
  const canonicalIsSelf =
    normalizedCanonical !== null && normalizedCanonical === normalizedFinalUrl;

  const noindex =
    data.metaRobots !== null && /\bnoindex\b/i.test(data.metaRobots);

  const sample = Array.from(new Set(data.internalLinks)).slice(
    0,
    BROKEN_LINK_SAMPLE,
  );
  const brokenLinksChecked = sample.length;
  let brokenLinks: BrokenLink[] = [];
  let brokenLinkError: string | null = null;

  try {
    brokenLinks = await checkBrokenLinks(sample, BROKEN_LINK_SAMPLE);
  } catch (err) {
    brokenLinkError =
      err instanceof Error ? err.message : "broken-link check failed";
  }

  const brokenRatio =
    brokenLinkError !== null
      ? 1
      : brokenLinksChecked === 0
        ? 0
        : brokenLinks.length / brokenLinksChecked;

  const checks: TechnicalChecks = {
    robotsExists,
    robotsValid,
    sitemapExists,
    sitemapValid,
    canonicalIsSelf,
    noindex,
    redirectCount: data.redirectCount,
    isHttps: data.isHttps,
    brokenRatio,
    metaRefresh: data.metaRefresh,
  };

  const score = technicalScore(checks);
  const findings: Finding[] = [];

  if (!robotsExists) {
    findings.push({
      severity: "high",
      category: "robots-txt-missing",
      issue: "robots.txt is missing",
      detail:
        "No robots.txt file was returned, so crawlers receive no explicit crawl guidance.",
      recommendation:
        "Serve a valid robots.txt at the site root that allows crawling and points to the sitemap.",
      evidence: { url: robotsUrl },
    });
  } else if (!robotsValid) {
    findings.push({
      severity: "high",
      category: "robots-txt-invalid",
      issue: "robots.txt is invalid",
      detail:
        "The robots.txt response could not be parsed as a valid robots file.",
      recommendation:
        "Rewrite robots.txt with valid `User-agent` groups and `Allow`/`Disallow` rules.",
      evidence: {
        url: robotsUrl,
        robotsTxt: data.robotsTxt?.slice(0, ROBOTS_PREVIEW_LIMIT) ?? null,
      },
    });
  }

  if (!sitemapExists) {
    findings.push({
      severity: "medium",
      category: "sitemap-missing",
      issue: "sitemap.xml is missing",
      detail:
        "No XML sitemap was returned, which slows discovery of new or updated pages.",
      recommendation:
        "Publish an XML sitemap at /sitemap.xml and reference it from robots.txt.",
      evidence: { url: `${origin}/sitemap.xml` },
    });
  } else if (!sitemapValid) {
    findings.push({
      severity: "medium",
      category: "sitemap-invalid",
      issue: "sitemap.xml is not valid XML",
      detail:
        "The sitemap response could not be parsed as a `<urlset>` or `<sitemapindex>` document.",
      recommendation:
        "Regenerate the sitemap as valid XML with a `<urlset>` or `<sitemapindex>` root element.",
      evidence: { url: `${origin}/sitemap.xml` },
    });
  }

  if (!canonicalIsSelf) {
    const hasCanonical = data.canonical !== null;
    findings.push({
      severity: "high",
      category: hasCanonical ? "canonical-mismatch" : "canonical-missing",
      issue: hasCanonical
        ? "Canonical points to a different URL"
        : "Canonical tag is missing",
      detail: hasCanonical
        ? "The declared canonical URL does not match the page's final URL, which can split ranking signals."
        : "The page does not declare a canonical URL, so search engines must choose the preferred version themselves.",
      recommendation:
        "Add a self-referencing `<link rel=\"canonical\">` that matches the page's final URL.",
      evidence: { canonical: data.canonical, finalUrl: data.finalUrl },
    });
  }

  if (noindex) {
    findings.push({
      severity: "critical",
      category: "noindex",
      issue: "Page is marked noindex",
      detail:
        "A robots meta tag instructs search engines to drop this page from their index.",
      recommendation:
        "Remove `noindex` from the robots meta tag on pages that should rank.",
      evidence: { metaRobots: data.metaRobots },
    });
  }

  if (data.redirectCount > 1) {
    findings.push({
      severity: "medium",
      category: "redirect-chain",
      issue: "Redirect chain detected",
      detail: `The URL resolved through ${data.redirectCount} redirects before reaching the final page.`,
      recommendation:
        "Point links directly at the final URL and keep at most one permanent redirect.",
      evidence: { redirectCount: data.redirectCount, finalUrl: data.finalUrl },
    });
  }

  if (!data.isHttps) {
    findings.push({
      severity: "critical",
      category: "no-https",
      issue: "Site is not served over HTTPS",
      detail:
        "The page is delivered over plain HTTP, which browsers and search engines treat as insecure.",
      recommendation:
        "Serve the site over HTTPS and redirect all HTTP requests to the HTTPS URL.",
      evidence: { finalUrl: data.finalUrl },
    });
  }

  if (brokenLinkError !== null) {
    findings.push({
      severity: "medium",
      category: "broken-link-check-failed",
      issue: "Broken link check failed",
      detail:
        "The link checker could not finish, so the broken-link ratio is unverified.",
      recommendation:
        "Re-run the audit; if the failure persists, check network egress from the audit service.",
      evidence: { reason: brokenLinkError },
    });
  } else if (brokenRatio >= BROKEN_LINK_RATIO_LIMIT && brokenLinksChecked > 0) {
    findings.push({
      severity: "high",
      category: "broken-links",
      issue: "Broken internal links found",
      detail: `${brokenLinks.length} of ${brokenLinksChecked} checked internal links failed (${Math.round(brokenRatio * 100)}%).`,
      recommendation:
        "Fix or remove the failing URLs so visitors and crawlers do not hit dead ends.",
      evidence: {
        checked: brokenLinksChecked,
        broken: brokenLinks.length,
        ratio: Number(brokenRatio.toFixed(3)),
        examples: brokenLinks.slice(0, 5),
      },
    });
  }

  if (data.metaRefresh) {
    findings.push({
      severity: "medium",
      category: "meta-refresh",
      issue: "Meta-refresh redirect present",
      detail:
        "The page uses `<meta http-equiv=\"refresh\">`, which is a slow and unreliable redirect.",
      recommendation:
        "Replace the meta refresh with a server-side 301 redirect to the target URL.",
    });
  }

  const sorted = sortBySeverity(findings);
  const passedChecks = [
    robotsExists && robotsValid,
    sitemapExists && sitemapValid,
    canonicalIsSelf,
    !noindex,
    data.redirectCount <= 1,
    data.isHttps,
    brokenLinkError === null && brokenRatio < BROKEN_LINK_RATIO_LIMIT,
    !data.metaRefresh,
  ].filter(Boolean).length;

  return {
    score,
    findings: sorted,
    summary: buildSummary(score, passedChecks, sorted),
    metrics: {
      robotsExists,
      robotsValid,
      sitemapExists,
      sitemapValid,
      canonicalIsSelf,
      noindex,
      redirectCount: data.redirectCount,
      isHttps: data.isHttps,
      brokenLinksChecked,
      brokenLinksFound: brokenLinks.length,
      brokenRatio: Number(brokenRatio.toFixed(3)),
      metaRefresh: data.metaRefresh,
    },
  };
}
