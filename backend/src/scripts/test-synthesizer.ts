import "dotenv/config";

import type {
  CategoryAnalysis,
  CategoryKey,
  Competitor,
  CrawlData,
  Niche,
} from "@rostify/shared";

import { overallFromAnalyses, synthesizeReport } from "../analysts/synthesizer.js";
import { FinalReportSchema } from "../lib/schemas.js";

/** Minimal crawl row — the synthesizer only reads url/title/screenshots. */
function fakeCrawl(url: string, title: string): CrawlData {
  return {
    url,
    finalUrl: url,
    statusCode: 200,
    isHttps: url.startsWith("https:"),
    redirectCount: 0,
    title,
    metaDescription: "",
    metaRobots: null,
    canonical: null,
    viewportMeta: "width=device-width",
    hreflang: [],
    ogTags: {},
    h1: [title],
    h2: [],
    h3: [],
    bodyText: "",
    wordCount: 0,
    images: [],
    internalLinks: [],
    externalLinks: [],
    jsonLd: [],
    microdata: false,
    metaRefresh: false,
    robotsTxt: null,
    sitemapXml: null,
    screenshotDesktopUrl: `${url}/desktop.png`,
    screenshotMobileUrl: `${url}/mobile.png`,
    crawledAt: new Date().toISOString(),
    crawlDurationMs: 0,
  };
}

function fakeAnalysis(score: number, issue: string): CategoryAnalysis {
  return {
    score,
    findings: [
      {
        severity: "high",
        category: "demo",
        issue,
        detail: "Demo finding used by the synthesizer smoke test.",
        recommendation: "Fix the demo finding.",
      },
    ],
    summary: `${issue}.`,
    metrics: {},
  };
}

async function main(): Promise<void> {
  const analyses: Record<CategoryKey, CategoryAnalysis> = {
    technical: fakeAnalysis(72, "Missing sitemap"),
    onpage: fakeAnalysis(64, "Title tag too short"),
    content: fakeAnalysis(55, "Thin content"),
    performance: fakeAnalysis(48, "Slow LCP"),
    offpage: fakeAnalysis(31, "Low domain authority"),
    ai_readiness: fakeAnalysis(40, "No structured data"),
  };

  const niche: Niche = {
    category: "digital marketing agency",
    location: "Global",
    keywords: ["seo audit", "website audit"],
  };

  const target = fakeCrawl("https://example.com", "Example");
  const competitorPages = [fakeCrawl("https://example.org", "Example competitor")];
  const competitors: Competitor[] = [
    {
      url: "https://example.org",
      title: "Example competitor",
      snippet: "",
      da: 42,
    },
  ];

  const { overall, grade } = overallFromAnalyses(analyses);
  console.log(`[synthesizer] computed overall ${overall}/100 (${grade})`);

  const report = await synthesizeReport({
    niche,
    target,
    competitors,
    competitorPages,
    keywordResearch: { country: "us", keywords: [], error: null },
    analyses,
    auditedAt: new Date().toISOString(),
    durationMs: 1234,
  });

  // Contract check: must be a schema-valid FinalReport (spec §7.3).
  FinalReportSchema.parse(report);

  console.log(JSON.stringify(report, null, 2));
  console.log(`\noverall: ${report.overall_score}/100 (${report.grade})`);
  console.log(`priorities: ${report.top_priorities.length}`);
  console.log(`summary: ${report.executive_summary}`);
}

main().catch((err: unknown) => {
  console.error("[fatal]", err);
  process.exitCode = 1;
});
