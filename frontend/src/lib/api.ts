import type { AuditPollResponse } from "@rostify/shared";

/**
 * The browser bundle must call the public API host. `NEXT_PUBLIC_API_BASE_URL`
 * (frontend/.env.production, or a Vercel project env var) wins; the fallback
 * keeps a production build working even when no env file reaches the builder.
 *
 * The value may be absolute (`https://api.example.com`) or relative (`/svc`).
 * A relative base is used by the single-container deploy, where the web app and
 * the API share one origin behind a reverse proxy.
 */
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  (process.env.NODE_ENV === "production"
    ? "https://roastifys-api.cartory.top"
    : "http://localhost:4000");

/**
 * Server components (the `/print` page used for PDF rendering) run in Node,
 * where a relative base has nothing to resolve against. Inside the container
 * the API listens on loopback, so fall back to that instead of fetching `"/svc"`.
 */
function serverBaseUrl(): string {
  return process.env.INTERNAL_API_BASE_URL ?? "http://127.0.0.1:4000";
}

function resolveBaseUrl(): string {
  if (typeof window !== "undefined") return API_BASE_URL;
  if (/^https?:\/\//i.test(API_BASE_URL)) return API_BASE_URL;
  return serverBaseUrl();
}

export type ApiError = {
  message: string;
  status: number;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${resolveBaseUrl()}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as
      | { error?: string; message?: string }
      | null;
    const message =
      body?.error ?? body?.message ?? `Request failed (${res.status})`;
    throw { message, status: res.status } satisfies ApiError;
  }

  return (await res.json()) as T;
}

export async function runAudit(url: string) {
  return request<{ auditId: string; status: string }>("/audit", {
    method: "POST",
    body: JSON.stringify({ url }),
  });
}

/** Render (or reuse) the report PDF for a completed audit. */
export async function createAuditPdf(id: string) {
  return request<{ pdfUrl: string }>(`/audit/${id}/pdf`, { method: "POST" });
}

export function getAudit(id: string) {
  return request<AuditPollResponse>(`/audit/${id}`);
}
