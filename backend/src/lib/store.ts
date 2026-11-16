import type {
  AuditRow,
  AuditStatus,
  AuditStep,
  CategoryAnalysis,
  Competitor,
  CrawlBundle,
  FinalReport,
  Niche,
} from "@rostify/shared";

import { AUDITS_COLLECTION, getPocketBase } from "./pb.js";

export class AuditStoreError extends Error {
  constructor(operation: string, cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(`Audit store ${operation} failed: ${detail}`);
    this.name = "AuditStoreError";
    this.cause = cause;
  }
}

/**
 * Analysis columns live inside the record's `payload` JSON field; the few
 * columns the pipeline needs to query/filter stay as real fields.
 */
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
  uiux_analysis: CategoryAnalysis;
  final_report: FinalReport;
  pdf_url: string | null;
  error_message: string | null;
  completed_at: string;
}>;

const SCALAR_KEYS = [
  "status",
  "current_step",
  "pdf_url",
  "error_message",
  "completed_at",
] as const;

type PayloadKey = Exclude<keyof AuditPatch, (typeof SCALAR_KEYS)[number]>;
type Payload = Partial<Pick<AuditPatch, PayloadKey>>;

type AuditRecord = {
  id: string;
  status?: string;
  current_step?: string;
  target_url: string;
  payload?: Payload | null;
  pdf_url?: string;
  error_message?: string;
  completed_at?: string;
  created?: string;
};

function orNull(value: string | undefined | null): string | null {
  return value === undefined || value === null || value === "" ? null : value;
}

function toIso(value: string | undefined): string {
  if (value === undefined || value === "") return new Date().toISOString();
  const parsed = new Date(value.replace(" ", "T"));
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function toAuditRow(record: AuditRecord): AuditRow {
  const payload = record.payload ?? {};
  return {
    id: record.id,
    status: (record.status as AuditStatus | undefined) ?? "pending",
    current_step: (orNull(record.current_step) as AuditStep | null) ?? null,
    target_url: record.target_url,
    niche: payload.niche ?? null,
    competitors: payload.competitors ?? null,
    crawl_data: payload.crawl_data ?? null,
    technical_analysis: payload.technical_analysis ?? null,
    onpage_analysis: payload.onpage_analysis ?? null,
    content_analysis: payload.content_analysis ?? null,
    performance_analysis: payload.performance_analysis ?? null,
    offpage_analysis: payload.offpage_analysis ?? null,
    ai_readiness_analysis: payload.ai_readiness_analysis ?? null,
    uiux_analysis: payload.uiux_analysis ?? null,
    final_report: payload.final_report ?? null,
    pdf_url: orNull(record.pdf_url),
    error_message: orNull(record.error_message),
    created_at: toIso(record.created),
    completed_at: orNull(record.completed_at),
  };
}

/** Insert a pending audit row and return its id (spec §10 POST /audit). */
export async function insertAudit(targetUrl: string): Promise<string> {
  try {
    const pb = await getPocketBase();
    const record = await pb.collection(AUDITS_COLLECTION).create({
      target_url: targetUrl,
      status: "pending",
      payload: {},
    });
    return String(record.id);
  } catch (err) {
    throw new AuditStoreError("insert", err);
  }
}

/** Fetch one audit row; `null` when the id does not exist. */
export async function fetchAudit(id: string): Promise<AuditRow | null> {
  try {
    const pb = await getPocketBase();
    const record = (await pb.collection(AUDITS_COLLECTION).getOne(id)) as AuditRecord;
    return toAuditRow(record);
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status === 404) return null;
    throw new AuditStoreError("fetch", err);
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
    const pb = await getPocketBase();
    const records = (await pb.collection(AUDITS_COLLECTION).getFullList({
      filter: 'status = "pending" || status = "running"',
    })) as AuditRecord[];

    const completedAt = new Date().toISOString();
    for (const record of records) {
      await pb.collection(AUDITS_COLLECTION).update(String(record.id), {
        status: "failed",
        current_step: "",
        completed_at: completedAt,
        error_message: reason,
      });
    }

    return records.length;
  } catch (err) {
    throw new AuditStoreError("recover", err);
  }
}

/**
 * Writes are read-merge-write against the record's `payload` JSON, and the
 * pipeline updates several analyses in parallel (technical/ai-readiness/niche/
 * performance, then content/off-page/vision). Without serialization those
 * merges race and silently drop keys, so every write to one audit is queued.
 */
const writeQueues = new Map<string, Promise<unknown>>();

function enqueueWrite<T>(id: string, task: () => Promise<T>): Promise<T> {
  const previous = writeQueues.get(id) ?? Promise.resolve();
  const next = previous.then(task, task);
  const tail = next.catch(() => undefined);

  writeQueues.set(id, tail);
  void tail.then(() => {
    if (writeQueues.get(id) === tail) writeQueues.delete(id);
  });

  return next;
}

/** Partial update of the audits row; no-op on an empty patch. */
export async function updateAudit(id: string, patch: AuditPatch): Promise<void> {
  if (Object.keys(patch).length === 0) return;

  await enqueueWrite(id, async () => {
    try {
      const pb = await getPocketBase();

      const fields: Record<string, unknown> = {};
      const payloadPatch: Payload = {};

      for (const [key, value] of Object.entries(patch)) {
        if ((SCALAR_KEYS as readonly string[]).includes(key)) {
          fields[key] = value;
        } else {
          (payloadPatch as Record<string, unknown>)[key] = value;
        }
      }

      if (Object.keys(payloadPatch).length > 0) {
        const current = (await pb.collection(AUDITS_COLLECTION).getOne(id)) as AuditRecord;
        fields.payload = { ...(current.payload ?? {}), ...payloadPatch };
      }

      await pb.collection(AUDITS_COLLECTION).update(id, fields);
    } catch (err) {
      throw new AuditStoreError("update", err);
    }
  });
}
