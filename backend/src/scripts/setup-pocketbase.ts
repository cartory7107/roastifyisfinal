/**
 * Creates the `audits` collection in a fresh PocketBase instance.
 *
 * Usage:
 *   pnpm --filter backend setup:pb
 *
 * Requires POCKETBASE_URL, POCKETBASE_ADMIN_EMAIL and
 * POCKETBASE_ADMIN_PASSWORD (a PocketBase superuser) in the environment.
 * The script is idempotent: an existing `audits` collection is left untouched.
 */
import "dotenv/config";

type Field = Record<string, unknown>;

const COLLECTION = "audits";

const FIELDS: Field[] = [
  {
    name: "target_url",
    type: "text",
    required: true,
    max: 0,
    min: 0,
    pattern: "",
  },
  { name: "status", type: "text", required: false, max: 0, min: 0, pattern: "" },
  {
    name: "current_step",
    type: "text",
    required: false,
    max: 0,
    min: 0,
    pattern: "",
  },
  { name: "payload", type: "json", required: false, maxSize: 0 },
  { name: "pdf_url", type: "text", required: false, max: 0, min: 0, pattern: "" },
  {
    name: "error_message",
    type: "text",
    required: false,
    max: 0,
    min: 0,
    pattern: "",
  },
  { name: "completed_at", type: "date", required: false },
  {
    name: "screenshots",
    type: "file",
    required: false,
    maxSelect: 20,
    maxSize: 20_971_520,
    mimeTypes: ["image/png", "image/jpeg", "image/webp"],
    thumbs: [],
    protected: false,
  },
  {
    name: "report",
    type: "file",
    required: false,
    maxSelect: 1,
    maxSize: 52_428_800,
    mimeTypes: ["application/pdf"],
    thumbs: [],
    protected: false,
  },
];

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(`Missing required environment variable ${name}.`);
  }
  return value.trim();
}

async function request(
  url: string,
  init: { method: string; token?: string; body?: unknown },
): Promise<{ status: number; json: unknown }> {
  const headers: Record<string, string> = {};
  if (init.token !== undefined) headers.Authorization = init.token;
  if (init.body !== undefined) headers["Content-Type"] = "application/json";

  const response = await fetch(url, {
    method: init.method,
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

  const text = await response.text();
  const json: unknown = text === "" ? null : JSON.parse(text);
  return { status: response.status, json };
}

async function main(): Promise<void> {
  const baseUrl = requireEnv("POCKETBASE_URL").replace(/\/+$/, "");
  const identity = requireEnv("POCKETBASE_ADMIN_EMAIL");
  const password = requireEnv("POCKETBASE_ADMIN_PASSWORD");

  const auth = await request(`${baseUrl}/api/collections/_superusers/auth-with-password`, {
    method: "POST",
    body: { identity, password },
  });
  if (auth.status !== 200 || typeof auth.json !== "object" || auth.json === null) {
    throw new Error(`PocketBase admin login failed (${auth.status}).`);
  }
  const token = (auth.json as { token?: unknown }).token;
  if (typeof token !== "string") {
    throw new Error("PocketBase admin login returned no token.");
  }

  const existing = await request(`${baseUrl}/api/collections/${COLLECTION}`, {
    method: "GET",
    token,
  });
  if (existing.status === 200) {
    console.log(`Collection "${COLLECTION}" already exists - nothing to do.`);
    return;
  }
  if (existing.status !== 404) {
    throw new Error(`Unexpected PocketBase response (${existing.status}) reading the collection.`);
  }

  const created = await request(`${baseUrl}/api/collections`, {
    method: "POST",
    token,
    body: {
      name: COLLECTION,
      type: "base",
      fields: FIELDS,
      indexes: ["CREATE INDEX idx_audits_status ON audits (status)"],
      listRule: null,
      viewRule: "",
      createRule: null,
      updateRule: null,
      deleteRule: null,
    },
  });

  if (created.status !== 200) {
    throw new Error(
      `Failed to create collection "${COLLECTION}" (${created.status}): ${JSON.stringify(created.json)}`,
    );
  }

  console.log(`Created collection "${COLLECTION}" with ${FIELDS.length} fields.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
