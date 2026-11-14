import type {
  AuditRow,
  AuditStep,
  AuditStatus,
  CategoryAnalysis,
  Competitor,
  CrawlBundle,
  FinalReport,
  Niche,
} from "@rostify/shared";

import { getSupabaseAdmin } from "./supabase.js";

export class AuditStoreError extends Error {
  constructor(operation: string, cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(`Audit store ${operation} failed: ${detail}`);
    this.name = "AuditStoreError";
    this.cause = cause;
  }
}

/** Column patch accepted by `updateAudit` — mirrors the audits table. */
export type AuditPatch = Partial<{
  status: AuditStatus;
  current_step: AuditStep | null;
  niche: Niche;
  competitors: Competitor[];
  crawl_data: CrawlBundle;
  technical_analysis: CategoryAnalysis;
  onpage_analysis: CategoryAnalysis;
  content_analysis: CategoryAnalysis;
  performance_analysis: CategoryAnalysis;
  offpage_analysis: CategoryAnalysis;
  ai_readiness_analysis: CategoryAnalysis;
  final_report: FinalReport;
  pdf_url: string | null;
  error_message: string | null;
  completed_at: string;
}>;

/** Insert a pending audit row and return its id (spec §10 POST /audit). */
export async function insertAudit(targetUrl: string): Promise<string> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("audits")
      .insert({ target_url: targetUrl, status: "pending" })
      .select("id")
      .single();

    if (error) throw new Error(error.message);
    return String(data.id);
  } catch (err) {
    throw new AuditStoreError("insert", err);
  }
}

/** Fetch one audit row; `null` when the id does not exist. */
export async function fetchAudit(id: string): Promise<AuditRow | null> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("audits")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    return (data as AuditRow | null) ?? null;
  } catch (err) {
    throw new AuditStoreError("fetch", err);
  }
}

/** Partial update of the audits row; no-op on an empty patch. */
export async function updateAudit(
  id: string,
  patch: AuditPatch,
): Promise<void> {
  if (Object.keys(patch).length === 0) return;

  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("audits")
      .update(patch)
      .eq("id", id);

    if (error) throw new Error(error.message);
  } catch (err) {
    throw new AuditStoreError("update", err);
  }
}
