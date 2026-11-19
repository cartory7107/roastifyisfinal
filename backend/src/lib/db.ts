import pg from "pg";

const CONNECTION_STRING = process.env.DATABASE_URL?.trim() ?? "";

/**
 * True when a Postgres connection string is configured. That switches the
 * whole backend into "serverless" mode: Neon/Postgres storage, fetch-based
 * crawling, PageSpeed Insights performance, and a Chromium-free PDF renderer.
 */
export const hasDatabase = CONNECTION_STRING.length > 0;

let pool: pg.Pool | null = null;
let schemaReady: Promise<void> | null = null;

function needsSsl(connectionString: string): boolean {
  const override = process.env.PGSSL?.trim().toLowerCase();
  if (override === "disable" || override === "false" || override === "off") {
    return false;
  }
  if (override === "require" || override === "true" || override === "on") {
    return true;
  }

  try {
    const host = new URL(connectionString).hostname;
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
      return false;
    }
  } catch {
    // Unparseable strings still get TLS; managed Postgres providers require it.
  }

  return true;
}

export function getPool(): pg.Pool {
  if (!hasDatabase) {
    throw new Error("DATABASE_URL is not set.");
  }

  if (pool === null) {
    pool = new pg.Pool({
      connectionString: CONNECTION_STRING,
      ssl: needsSsl(CONNECTION_STRING) ? { rejectUnauthorized: false } : undefined,
      max: Number(process.env.PG_POOL_MAX ?? 5),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 15_000,
    });

    // Neon suspends idle computes; a dropped idle connection must not crash a
    // background audit. The pool discards it and opens a new one on demand.
    pool.on("error", (err) => {
      console.warn(`[db] idle client error: ${err.message}`);
    });
  }

  return pool;
}

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS audits (
  id text PRIMARY KEY,
  target_url text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  current_step text,
  niche jsonb,
  keyword_research jsonb,
  competitors jsonb,
  crawl_data jsonb,
  technical_analysis jsonb,
  onpage_analysis jsonb,
  content_analysis jsonb,
  performance_analysis jsonb,
  offpage_analysis jsonb,
  ai_readiness_analysis jsonb,
  uiux_analysis jsonb,
  final_report jsonb,
  pdf_url text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS audits_status_idx ON audits (status);
CREATE INDEX IF NOT EXISTS audits_created_at_idx ON audits (created_at DESC);

CREATE TABLE IF NOT EXISTS audit_files (
  audit_id text NOT NULL,
  filename text NOT NULL,
  mime_type text NOT NULL,
  bytes bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (audit_id, filename)
);
`;

/**
 * Create the tables once per process. Safe to call from every request: the
 * promise is memoized and retried after a failure.
 */
export async function ensureSchema(): Promise<void> {
  if (!hasDatabase) return;

  if (schemaReady === null) {
    schemaReady = (async () => {
      await getPool().query(SCHEMA_SQL);
    })().catch((err) => {
      schemaReady = null;
      throw err;
    });
  }

  await schemaReady;
}
