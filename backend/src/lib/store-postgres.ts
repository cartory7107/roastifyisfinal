import { randomUUID } from "node:crypto";

import type {
  AuditRow,
  AuditStatus,
  AuditStep,
  CategoryAnalysis,
  Competitor,
  CrawlBundle,
  FinalReport,
  KeywordResearch,
  Niche,
} from "@rostify/shared";

import type { AuditPatch } from "./audit-patch.js";
import { trimCrawlData } from "./crawl-trim.js";
import { getPool } from "./db.js";
import { AuditStoreError } from "./store-error.js";

/**
 * PocketBase ids are 15-char alphanumerics, so the Postgres store keeps the
 * same shape (hex, no dashes) and the existing id validation keeps working.
 */
function newAuditId(): string {
  return randomUUID().replace(/-/g, "").slice(0, 20);
}

const JSON_COLUMNS = new Set<string>([
  "niche",
  "keyword_research",
  "competitors",
  "crawl_data",
  "technical_analysis",
  "onpage_analysis",
  "content_analysis",
  "performance_analysis",
  "offpage_analysis",
  "ai_readiness_analysis",
  "uiux_analysis",
  "final_report",
]);

const SCALAR_COLUMNS = new Set<string>([
  "status",
  "current_step",
  "pdf_url",
  "error_message",
  "completed_at",
]);

type AuditDbRow = {
  id: string;
  target_url: string;
  status: string;
  current_step: string | null;
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
  uiux_analysis: CategoryAnalysis | null;
  final_report: FinalReport | null;
  pdf_url: string | null;
  error_message: string | null;
  created_at: Date;
  completed_at: Date | null;
};

function toAuditRow(row: AuditDbRow): AuditRow {
  return {
    id: row.id,
    status: (row.status as AuditStatus | undefined) ?? "pending",
    current_step: (row.current_step as AuditStep | null) ?? null,
    target_url: row.target_url,
    niche: row.niche ?? null,
    keyword_research: row.keyword_research ?? null,
    competitors: row.competitors ?? null,
    crawl_data: row.crawl_data ?? null,
    technical_analysis: row.technical_analysis ?? null,
    onpage_analysis: row.onpage_analysis ?? null,
    content_analysis: row.content_analysis ?? null,
    performance_analysis: row.performance_analysis ?? null,
    offpage_analysis: row.offpage_analysis ?? null,
    ai_readiness_analysis: row.ai_readiness_analysis ?? null,
    uiux_analysis: row.uiux_analysis ?? null,
    final_report: row.final_report ?? null,
    pdf_url: row.pdf_url ?? null,
    error_message: row.error_message ?? null,
    created_at: row.created_at.toISOString(),
    completed_at: row.completed_at === null ? null : row.completed_at.toISOString(),
  };
}

/** Insert a pending audit row and return its id. */
export async function insertAudit(targetUrl: string): Promise<string> {
  try {
    const id = newAuditId();
    await getPool().query(
      "INSERT INTO audits (id, target_url, status) VALUES ($1, $2, 'pending')",
      [id, targetUrl],
    );
    return id;
  } catch (err) {
    throw new AuditStoreError("insert", err);
  }
}

/** Fetch one audit row; `null` when the id does not exist. */
export async function fetchAudit(id: string): Promise<AuditRow | null> {
  try {
    const result = await getPool().query<AuditDbRow>(
      "SELECT * FROM audits WHERE id = $1",
      [id],
    );
    const row = result.rows[0];
    return row === undefined ? null : toAuditRow(row);
  } catch (err) {
    throw new AuditStoreError("fetch", err);
  }
}

/**
 * Partial update. Postgres writes each column independently, so the parallel
 * pipeline stages can update different analyses at the same time without the
 * read-merge-write queue the PocketBase store needs.
 */
export async function updateAudit(id: string, patch: AuditPatch): Promise<void> {
  const entries = Object.entries(patch).filter(
    ([key]) => JSON_COLUMNS.has(key) || SCALAR_COLUMNS.has(key),
  );
  if (entries.length === 0) return;

  const values: unknown[] = [];
  const assignments = entries.map(([key, value]) => {
    const stored =
      key === "crawl_data"
        ? trimCrawlData(value as CrawlBundle)
        : value;
    values.push(JSON_COLUMNS.has(key) ? JSON.stringify(stored) : stored);
    return `${key} = $${values.length}`;
  });

  values.push(id);

  try {
    const result = await getPool().query(
      `UPDATE audits SET ${assignments.join(", ")} WHERE id = $${values.length}`,
      values,
    );
    if (result.rowCount === 0) {
      throw new Error(`audit ${id} not found`);
    }
  } catch (err) {
    throw new AuditStoreError("update", err);
  }
}

/**
 * Startup recovery: a crash or restart leaves rows stuck in `pending`/`running`
 * because the in-process pipeline is gone. Marking them failed stops the client
 * from polling a status that can never change.
 */
export async function failInterruptedAudits(
  reason = "Interrupted by a server restart",
): Promise<number> {
  try {
    const result = await getPool().query(
      `UPDATE audits
          SET status = 'failed',
              current_step = NULL,
              completed_at = now(),
              error_message = $1
        WHERE status IN ('pending', 'running')
        RETURNING id`,
      [reason],
    );
    return result.rowCount ?? 0;
  } catch (err) {
    throw new AuditStoreError("recover", err);
  }
}
