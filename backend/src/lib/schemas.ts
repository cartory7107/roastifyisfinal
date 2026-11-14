import { z } from "zod";

/* ---------- Enums ---------- */

export const AuditStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
]);

export const AuditStepSchema = z.enum([
  "crawl_target",
  "niche",
  "technical",
  "ai_readiness",
  "performance",
  "competitor",
  "crawl_competitors",
  "onpage",
  "content",
  "offpage",
  "vision",
  "synthesize",
  "pdf",
]);

export const SeveritySchema = z.enum(["critical", "high", "medium", "low"]);

export const GradeSchema = z.enum(["A+", "A", "B", "C", "D", "F"]);

/* ---------- Crawl ---------- */

export const CrawlDataSchema = z.object({
  url: z.string(),
  finalUrl: z.string(),
  statusCode: z.number().int().min(0),
  isHttps: z.boolean(),
  redirectCount: z.number().int().min(0),

  title: z.string(),
  metaDescription: z.string(),
  metaRobots: z.string().nullable(),
  canonical: z.string().nullable(),
  viewportMeta: z.string().nullable(),
  hreflang: z.array(z.string()),
  ogTags: z.record(z.string()),

  h1: z.array(z.string()),
  h2: z.array(z.string()),
  h3: z.array(z.string()),

  bodyText: z.string(),
  wordCount: z.number().int().min(0),
  images: z.array(z.object({ src: z.string(), alt: z.string().nullable() })),
  internalLinks: z.array(z.string()),
  externalLinks: z.array(z.string()),

  jsonLd: z.array(z.unknown()),
  microdata: z.boolean(),
  metaRefresh: z.boolean(),

  robotsTxt: z.string().nullable(),
  sitemapXml: z.string().nullable(),

  screenshotDesktopUrl: z.string(),
  screenshotMobileUrl: z.string(),

  crawledAt: z.string(),
  crawlDurationMs: z.number().int().min(0),
});

export const BrokenLinkSchema = z.object({
  url: z.string(),
  status: z.number().nullable(),
  error: z.string().nullable(),
});

/* ---------- Analysis ---------- */

export const FindingSchema = z.object({
  severity: SeveritySchema,
  category: z.string(),
  issue: z.string(),
  detail: z.string(),
  recommendation: z.string(),
  evidence: z.record(z.unknown()).optional(),
});

export const CategoryAnalysisSchema = z.object({
  score: z.number().min(0).max(100),
  findings: z.array(FindingSchema),
  summary: z.string(),
  metrics: z.record(z.unknown()),
});

/* ---------- Pipeline inputs ---------- */

export const NicheSchema = z.object({
  category: z.string(),
  location: z.string(),
  keywords: z.array(z.string()),
});

export const CompetitorSchema = z.object({
  url: z.string(),
  title: z.string(),
  snippet: z.string(),
  da: z.number().nullable(),
});

/* ---------- Report ---------- */

export const CategoryKeySchema = z.enum([
  "technical",
  "onpage",
  "content",
  "performance",
  "offpage",
  "ai_readiness",
]);

export const FinalReportSchema = z.object({
  overall_score: z.number().min(0).max(100),
  grade: GradeSchema,
  category_scores: z.record(CategoryKeySchema, CategoryAnalysisSchema),
  executive_summary: z.string(),
  top_priorities: z.array(
    z.object({ title: z.string(), category: z.string(), why: z.string() }),
  ),
  competitors: z.array(
    z.object({ url: z.string(), title: z.string(), da: z.number().nullable() }),
  ),
  screenshots: z.object({
    target: z.object({ desktop: z.string(), mobile: z.string() }),
    competitors: z.array(z.object({ url: z.string(), mobile: z.string() })),
  }),
  meta: z.object({
    url: z.string(),
    audited_at: z.string(),
    duration_ms: z.number().int().min(0),
  }),
});

/* ---------- API ---------- */

export const CreateAuditRequestSchema = z.object({
  url: z.string().url(),
});

export const AuditIdParamsSchema = z.object({
  id: z.string().uuid(),
});
