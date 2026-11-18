/* ---------- Shared enums ---------- */

export type AuditStatus = "pending" | "running" | "completed" | "failed";

export type AuditStep =
  | "crawl_target"
  | "niche"
  | "keywords"
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

export type MeasurementStatus = "measured" | "unavailable";

export type CategoryAnalysis = {
  score: number;
  /**
   * "unavailable" when an external check (API, Lighthouse, vision model) could
   * not run: the score is a neutral placeholder only and is EXCLUDED from the
   * overall score. Absent = fully measured.
   */
  measurement?: MeasurementStatus;
  measurement_reason?: string | null;
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

/** A related term seodata.dev returns alongside a keyword lookup. */
export type KeywordSuggestion = {
  keyword: string;
  volume: number | null;
  cpc: number | null;
  /** How closely the term's results overlap the queried keyword (0-100). */
  overlap: number | null;
};

/** One keyword enriched with seodata.dev demand data (spec §8.7 keyword research). */
export type KeywordMetric = {
  keyword: string;
  /** Monthly searches in the researched country, null when it has no data. */
  volume: number | null;
  /** Google Ads cost per click, null when it has no data. */
  cpc: number | null;
  /** Google Ads competition, 0-1, null when it has no data. */
  competition: number | null;
  /** Related terms, ordered by overlap, as returned by the API. */
  similar: KeywordSuggestion[];
};

export type KeywordResearch = {
  /** Two-letter country the volumes were measured for. */
  country: string;
  keywords: KeywordMetric[];
  /** Why the research is empty, null when every lookup succeeded. */
  error: "rate_limited" | "unavailable" | null;
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
  /** Demand data for the niche's keywords, null when research was unavailable. */
  keywords: KeywordResearch | null;
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
  keyword_research: KeywordResearch | null;
  competitors: Competitor[] | null;
  crawl_data: CrawlBundle | null;
  technical_analysis: CategoryAnalysis | null;
  onpage_analysis: CategoryAnalysis | null;
  content_analysis: CategoryAnalysis | null;
  performance_analysis: CategoryAnalysis | null;
  offpage_analysis: CategoryAnalysis | null;
  ai_readiness_analysis: CategoryAnalysis | null;
  /** Screenshot-based UI/UX review (spec §8.9) — shown alongside the 6 scored categories. */
  uiux_analysis: CategoryAnalysis | null;
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

/** The target page's on-page snapshot, for quoting real copy in the report UI. */
export type PageSnapshot = {
  url: string;
  title: string;
  metaDescription: string;
  h1: string[];
  h2: string[];
  wordCount: number;
  statusCode: number;
};

export type AuditPollResponse = {
  id: string;
  status: AuditStatus;
  currentStep: AuditStep | null;
  /** The URL the user submitted, shown while the audit is still crawling. */
  targetUrl: string;
  result: FinalReport | null;
  error: string | null;
  /** Screenshot UI/UX review shown next to the six scored categories (spec §8.9). */
  uiux: CategoryAnalysis | null;
  /** Set once the PDF stage produces a file (spec §13, phase 11). */
  pdfUrl: string | null;
  page: PageSnapshot | null;
};

export type HealthResponse = {
  ok: true;
  timestamp: string;
};
