/* ---------- Shared enums ---------- */

export type AuditStatus = "pending" | "running" | "completed" | "failed";

export type AuditStep =
  | "crawl_target"
  | "niche"
  | "technical"
  | "ai_readiness"
  | "performance"
  | "competitor"
  | "crawl_competitors"
  | "onpage"
  | "content"
  | "offpage"
  | "vision"
  | "synthesize"
  | "pdf";

export type Severity = "critical" | "high" | "medium" | "low";

export type Grade = "A+" | "A" | "B" | "C" | "D" | "F";

/* ---------- Crawl contract ---------- */

export type CrawledImage = {
  src: string;
  alt: string | null;
};

export type CrawlData = {
  url: string;
  finalUrl: string;
  statusCode: number;
  isHttps: boolean;
  redirectCount: number;

  title: string;
  metaDescription: string;
  metaRobots: string | null;
  canonical: string | null;
  viewportMeta: string | null;
  hreflang: string[];
  ogTags: Record<string, string>;

  h1: string[];
  h2: string[];
  h3: string[];

  bodyText: string;
  wordCount: number;
  images: CrawledImage[];
  internalLinks: string[];
  externalLinks: string[];

  jsonLd: unknown[];
  microdata: boolean;
  metaRefresh: boolean;

  robotsTxt: string | null;
  sitemapXml: string | null;

  screenshotDesktopUrl: string;
  screenshotMobileUrl: string;

  crawledAt: string;
  crawlDurationMs: number;
};

/* ---------- Analysis contract ---------- */

export type Finding = {
  severity: Severity;
  category: string;
  issue: string;
  detail: string;
  recommendation: string;
  evidence?: Record<string, unknown>;
};

export type CategoryAnalysis = {
  score: number;
  findings: Finding[];
  summary: string;
  metrics: Record<string, unknown>;
};

/* ---------- Pipeline inputs ---------- */

export type Niche = {
  category: string;
  location: string;
  keywords: string[];
};

export type Competitor = {
  url: string;
  title: string;
  snippet: string;
  da: number | null;
};

/* ---------- Report contract ---------- */

export type CategoryKey =
  | "technical"
  | "onpage"
  | "content"
  | "performance"
  | "offpage"
  | "ai_readiness";

export type FinalReport = {
  overall_score: number;
  grade: Grade;
  category_scores: Record<CategoryKey, CategoryAnalysis>;
  executive_summary: string;
  top_priorities: { title: string; category: string; why: string }[];
  competitors: { url: string; title: string; da: number | null }[];
  screenshots: {
    target: { desktop: string; mobile: string };
    competitors: { url: string; mobile: string }[];
  };
  meta: {
    url: string;
    audited_at: string;
    duration_ms: number;
  };
};

/* ---------- Persistence ---------- */

export type CrawlBundle = {
  target: CrawlData;
  competitors: CrawlData[];
};

export type AuditRow = {
  id: string;
  status: AuditStatus;
  current_step: AuditStep | null;
  target_url: string;
  niche: Niche | null;
  competitors: Competitor[] | null;
  crawl_data: CrawlBundle | null;
  technical_analysis: CategoryAnalysis | null;
  onpage_analysis: CategoryAnalysis | null;
  content_analysis: CategoryAnalysis | null;
  performance_analysis: CategoryAnalysis | null;
  offpage_analysis: CategoryAnalysis | null;
  ai_readiness_analysis: CategoryAnalysis | null;
  final_report: FinalReport | null;
  pdf_url: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
};

/* ---------- API contract ---------- */

export type CreateAuditRequest = {
  url: string;
};

export type CreateAuditResponse = {
  auditId: string;
  status: AuditStatus;
};

export type AuditPollResponse = {
  id: string;
  status: AuditStatus;
  currentStep: AuditStep | null;
  result: FinalReport | null;
  error: string | null;
};

export type HealthResponse = {
  ok: true;
  timestamp: string;
};
