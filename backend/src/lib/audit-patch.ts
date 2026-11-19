import type {
  AuditStatus,
  AuditStep,
  CategoryAnalysis,
  Competitor,
  CrawlBundle,
  FinalReport,
  KeywordResearch,
  Niche,
} from "@rostify/shared";

/**
 * Analysis columns live in their own JSON columns; the few scalar columns the
 * pipeline needs to query/filter stay as real fields. The shape is shared by
 * the PocketBase and Postgres stores.
 */
export type AuditPatch = Partial<{
  status: AuditStatus;
  current_step: AuditStep | null;
  niche: Niche;
  keyword_research: KeywordResearch;
  competitors: Competitor[];
  crawl_data: CrawlBundle;
  technical_analysis: CategoryAnalysis;
  onpage_analysis: CategoryAnalysis;
  content_analysis: CategoryAnalysis;
  performance_analysis: CategoryAnalysis;
  offpage_analysis: CategoryAnalysis;
  ai_readiness_analysis: CategoryAnalysis;
  uiux_analysis: CategoryAnalysis;
  final_report: FinalReport;
  pdf_url: string | null;
  error_message: string | null;
  completed_at: string;
}>;
