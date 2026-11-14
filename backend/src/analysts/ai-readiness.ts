import type { CategoryAnalysis, CrawlData, Finding } from "@rostify/shared";
import { sortBySeverity } from "../lib/findings.js";
import { robotsParser } from "../lib/robots.js";
import { aiReadinessScore, type AiReadinessFacts } from "../lib/scoring.js";

const AI_BOTS = [
  "GPTBot",
  "ClaudeBot",
  "Google-Extended",
  "CCBot",
  "PerplexityBot",
] as const;

const RICH_RESULT_TYPES = [
  "Article",
  "FAQPage",
  "HowTo",
  "Product",
  "LocalBusiness",
  "Organization",
  "BreadcrumbList",
  "Recipe",
  "Review",
] as const;

const LLMS_TXT_TIMEOUT_MS = 10_000;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

type LlmsTxtResult = {
  exists: boolean;
  url: string;
  status: number | null;
  contentType: string | null;
  error: string | null;
};

/** Walk a JSON-LD block and collect every declared `@type` value. */
function collectSchemaTypes(value: unknown, into: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectSchemaTypes(item, into);
    return;
  }

  if (value === null || typeof value !== "object") return;

  const record = value as Record<string, unknown>;
  const type = record["@type"];

  if (typeof type === "string" && type.trim().length > 0) {
    into.add(type.trim());
  } else if (Array.isArray(type)) {
    for (const entry of type) {
      if (typeof entry === "string" && entry.trim().length > 0) {
        into.add(entry.trim());
      }
    }
  }

  for (const [key, nested] of Object.entries(record)) {
    if (key === "@type") continue;
    collectSchemaTypes(nested, into);
  }
}

/** `https://schema.org/Article` and `schema:Article` become `article`. */
function normalizeSchemaType(type: string): string {
  return type
    .trim()
    .replace(/^https?:\/\/schema\.org\//i, "")
    .replace(/^schema:/i, "")
    .toLowerCase();
}

function findRichResultTypes(schemaTypes: string[]): string[] {
  const present = new Set(schemaTypes.map(normalizeSchemaType));
  return RICH_RESULT_TYPES.filter((type) => present.has(type.toLowerCase()));
}

async function fetchLlmsTxt(origin: string): Promise<LlmsTxtResult> {
  const url = `${origin}/llms.txt`;

  try {
    const response = await fetch(url, {
      headers: { "user-agent": USER_AGENT, accept: "text/plain,*/*" },
      redirect: "follow",
      signal: AbortSignal.timeout(LLMS_TXT_TIMEOUT_MS),
    });
    const contentType = response.headers.get("content-type");

    if (response.status !== 200) {
      await response.body?.cancel().catch(() => undefined);
      return { exists: false, url, status: response.status, contentType, error: null };
    }

    const body = await response.text();
    // Some hosts omit content-type entirely; accept a non-empty plain body then.
    const isPlainText =
      contentType === null || contentType.toLowerCase().includes("text/plain");
    const exists = isPlainText && body.trim().length > 0;

    return { exists, url, status: response.status, contentType, error: null };
  } catch (err) {
    return {
      exists: false,
      url,
      status: null,
      contentType: null,
      error: err instanceof Error ? err.message : "llms.txt fetch failed",
    };
  }
}

function findBlockedBots(
  robotsTxt: string | null,
  robotsUrl: string,
  targetUrl: string,
): string[] {
  if (robotsTxt === null) return [];

  try {
    const parser = robotsParser(robotsUrl, robotsTxt);
    return AI_BOTS.filter(
      (bot) => parser.isAllowed(targetUrl, bot) === false,
    );
  } catch {
    return [];
  }
}

function buildSummary(score: number, findings: Finding[]): string {
  if (findings.length === 0) {
    return `AI readiness score ${score}/100 — structured data, llms.txt, and AI crawler access are all in place.`;
  }

  const gaps = findings
    .slice(0, 2)
    .map((finding) => finding.issue.toLowerCase())
    .join(" and ");

  return `AI readiness score ${score}/100. Main gaps: ${gaps}.`;
}

export async function analyzeAiReadiness(
  data: CrawlData,
): Promise<CategoryAnalysis> {
  const origin = new URL(data.finalUrl).origin;
  const robotsUrl = `${origin}/robots.txt`;

  const typeSet = new Set<string>();
  for (const block of data.jsonLd) {
    collectSchemaTypes(block, typeSet);
  }
  const schemaTypes = Array.from(typeSet);

  const hasJsonLd = data.jsonLd.length > 0;
  const schemaValid = hasJsonLd && schemaTypes.length > 0;

  const llms = await fetchLlmsTxt(origin);
  const blockedBots = findBlockedBots(data.robotsTxt, robotsUrl, data.finalUrl);
  const richResultTypes = findRichResultTypes(schemaTypes);

  const facts: AiReadinessFacts = {
    hasJsonLd,
    schemaValid,
    hasLlmsTxt: llms.exists,
    blockedBots,
    richResultTypes,
  };

  const score = aiReadinessScore(facts);
  const findings: Finding[] = [];

  if (!hasJsonLd) {
    findings.push({
      severity: "high",
      category: "json-ld-missing",
      issue: "No JSON-LD structured data",
      detail:
        "The page exposes no JSON-LD schema, leaving search and AI systems to infer its content.",
      recommendation:
        "Add JSON-LD for the primary entity (Organization, WebSite, Article, Product, or LocalBusiness).",
    });
  } else if (!schemaValid) {
    findings.push({
      severity: "high",
      category: "json-ld-invalid",
      issue: "JSON-LD has no usable schema type",
      detail:
        "JSON-LD blocks exist but none declares a schema.org `@type`, so they cannot be interpreted.",
      recommendation:
        "Give every JSON-LD block a valid `@type` (for example `Organization` or `WebPage`).",
      evidence: { blocks: data.jsonLd.length },
    });
  }

  if (!llms.exists) {
    findings.push({
      severity: "low",
      category: "llms-txt-missing",
      issue: "llms.txt is missing",
      detail:
        "No llms.txt file was found at the site root, so AI assistants get no curated content map.",
      recommendation:
        "Publish a plain-text /llms.txt describing the site and its key pages.",
      evidence: {
        url: llms.url,
        status: llms.status,
        contentType: llms.contentType,
        error: llms.error,
      },
    });
  }

  if (blockedBots.length > 0) {
    findings.push({
      severity: "medium",
      category: "ai-bots-blocked",
      issue: "AI crawlers are blocked",
      detail: `robots.txt disallows ${blockedBots.join(", ")}, so AI search and assistants cannot read the site.`,
      recommendation:
        "Allow the AI crawlers you want to appear in by removing their `Disallow` rules.",
      evidence: { blockedBots, robotsUrl },
    });
  }

  if (richResultTypes.length === 0) {
    findings.push({
      severity: "medium",
      category: "no-rich-result-schema",
      issue: "No rich result eligible schema",
      detail:
        "The page has no schema type that can produce a rich result in search listings.",
      recommendation:
        "Add a supported schema type such as Article, FAQPage, Product, or BreadcrumbList.",
      evidence: { schemaTypes },
    });
  }

  const sorted = sortBySeverity(findings);

  return {
    score,
    findings: sorted,
    summary: buildSummary(score, sorted),
    metrics: {
      hasJsonLd,
      schemaValid,
      schemaTypes,
      hasLlmsTxt: llms.exists,
      llmsTxtUrl: llms.url,
      blockedBots,
      richResultTypes,
    },
  };
}
