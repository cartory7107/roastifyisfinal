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

export const CrawledImageSchema = z.object({
  src: z.string(),
  alt: z.string().nullable(),
});

export const CrawlDataSchema = z.object({
  url: z.string(),
  finalUrl: z.string(),
  statusCode: z.number(),
  isHttps: z.boolean(),
  redirectCount: z.number(),

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
  wordCount: z.number(),
  images: z.array(CrawledImageSchema),
  internalLinks: z.array(z.string()),
  externalLinks: z.array(z.string()),

  jsonLd: z.array(z.unknown()),
  microdata: z.boolean(),

  robotsTxt: z.string().nullable(),
  sitemapXml: z.string().nullable(),

  screenshotDesktopUrl: z.string(),
  screenshotMobileUrl: z.string(),

  crawledAt: z.string(),
  crawlDurationMs: z.number(),
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
  score: z.number(),
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
  overall_score: z.number(),
  grade: GradeSchema,
  category_scores: z.record(CategoryKeySchema, CategoryAnalysisSchema),
  executive_summary: z.string(),
  top_priorities: z.array(
    z.object({
      title: z.string(),
      category: z.string(),
      why: z.string(),
    }),
  ),
  competitors: z.array(
    z.object({
      url: z.string(),
      title: z.string(),
      da: z.number().nullable(),
    }),
  ),
  screenshots: z.object({
    target: z.object({ desktop: z.string(), mobile: z.string() }),
    competitors: z.array(z.object({ url: z.string(), mobile: z.string() })),
  }),
  meta: z.object({
    url: z.string(),
    audited_at: z.string(),
    duration_ms: z.number(),
  }),
});

/* ---------- Persistence ---------- */

export const CrawlBundleSchema = z.object({
  target: CrawlDataSchema,
  competitors: z.array(CrawlDataSchema),
});

export const AuditRowSchema = z.object({
  id: z.string().uuid(),
  status: AuditStatusSchema,
  current_step: AuditStepSchema.nullable(),
  target_url: z.string(),
  niche: NicheSchema.nullable(),
  competitors: z.array(CompetitorSchema).nullable(),
  crawl_data: CrawlBundleSchema.nullable(),
  technical_analysis: CategoryAnalysisSchema.nullable(),
  onpage_analysis: CategoryAnalysisSchema.nullable(),
  content_analysis: CategoryAnalysisSchema.nullable(),
  performance_analysis: CategoryAnalysisSchema.nullable(),
  offpage_analysis: CategoryAnalysisSchema.nullable(),
  ai_readiness_analysis: CategoryAnalysisSchema.nullable(),
  final_report: FinalReportSchema.nullable(),
  pdf_url: z.string().nullable(),
  error_message: z.string().nullable(),
  created_at: z.string(),
  completed_at: z.string().nullable(),
});

/* ---------- API ---------- */

export const CreateAuditRequestSchema = z.object({
  url: z.string().url(),
});

export const CreateAuditResponseSchema = z.object({
  auditId: z.string().uuid(),
  status: AuditStatusSchema,
});

export const AuditPollResponseSchema = z.object({
  id: z.string().uuid(),
  status: AuditStatusSchema,
  currentStep: AuditStepSchema.nullable(),
  result: FinalReportSchema.nullable(),
  error: z.string().nullable(),
});

export const HealthResponseSchema = z.object({
  ok: z.literal(true),
  timestamp: z.string(),
});
