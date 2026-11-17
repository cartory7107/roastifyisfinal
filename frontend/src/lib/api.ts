import type { AuditPollResponse } from "@rostify/shared";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export type ApiError = {
  message: string;
  status: number;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
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
