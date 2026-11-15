"use client";

import type { AuditPollResponse } from "@rostify/shared";
import { AlertTriangle, ArrowLeft, Clock, Loader2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import * as React from "react";

import { ProgressSteps } from "@/components/report/ProgressSteps";
import { ReportView } from "@/components/report/ReportView";
import { getAudit, type ApiError } from "@/lib/api";
import { hostOf } from "@/lib/report";

const POLL_INTERVAL_MS = 2000;
/** Typical wall-clock time for one audit; only used to reassure, never enforced. */
const ESTIMATED_SECONDS = 120;

export default function AuditPage() {
  const params = useParams<{ id: string }>();
  const auditId = typeof params.id === "string" ? params.id : params.id[0];

  const [data, setData] = React.useState<AuditPollResponse | null>(null);
  const [error, setError] = React.useState<ApiError | null>(null);
  const [elapsed, setElapsed] = React.useState(0);

  const isSettled =
    data !== null && (data.status === "completed" || data.status === "failed");

  // Poll until the audit reaches a terminal state. A failed request keeps the
  // loop alive: transient network errors should not kill a two-minute audit.
  React.useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function tick() {
      try {
        const next = await getAudit(auditId);
        if (cancelled) return;
        setData(next);
        setError(null);
        if (next.status === "completed" || next.status === "failed") return;
      } catch (err) {
        if (cancelled) return;
        const apiError = err as ApiError;
        setError(apiError);
        if (apiError.status === 404) return;
      }
      timer = setTimeout(tick, POLL_INTERVAL_MS);
    }

    void tick();

    return () => {
      cancelled = true;
      if (timer !== null) clearTimeout(timer);
    };
  }, [auditId]);

  // Wall-clock timer for the progress screen.
  React.useEffect(() => {
    if (isSettled) return;
    const startedAt = Date.now();
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [isSettled]);

  if (data !== null && data.status === "completed" && data.result !== null) {
    return (
      <main className="min-h-screen bg-secondary/30">
        <ReportView
          auditId={data.id}
          report={data.result}
          uiux={data.uiux}
          page={data.page}
          pdfUrl={data.pdfUrl}
        />
      </main>
    );
  }

  const notFound = error?.status === 404 || data?.status === "failed";
  const host = data === null ? null : hostOf(data.targetUrl);
  const remaining = Math.max(0, ESTIMATED_SECONDS - elapsed);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col justify-center px-4 py-12 sm:px-6">
      <Link
        href="/"
        className="mb-8 inline-flex w-fit items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft aria-hidden className="h-3.5 w-3.5" />
        Run another audit
      </Link>

      {notFound ? (
        <section className="rounded-2xl border border-border bg-background p-6 shadow-sm sm:p-8">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle aria-hidden className="h-5 w-5" />
          </span>
          <h1 className="mt-4 text-xl font-semibold tracking-tight">
            {error?.status === 404 ? "Audit not found" : "This audit failed"}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {error?.status === 404
              ? "The link may be wrong, or the audit was never created."
              : (data?.error ??
                "The page could not be audited. This usually means the site blocked our crawler or the URL did not load.")}
          </p>
          <Link
            href="/"
            className="mt-5 inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
          >
            Try another URL
          </Link>
        </section>
      ) : (
        <section className="rounded-2xl border border-border bg-background p-6 shadow-sm sm:p-8">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
            <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" />
            Audit running
          </div>
          <h1 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">
            {host === null ? "Auditing your page" : `Auditing ${host}`}
          </h1>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            We crawl the page, run Lighthouse, find the two pages outranking you
            and score six categories. This usually takes about two minutes —
            keep this tab open.
          </p>

          <ProgressSteps
            className="mt-6 border-t border-border pt-6"
            currentStep={data?.currentStep ?? null}
            status={data?.status ?? "pending"}
          />

          <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Clock aria-hidden className="h-3.5 w-3.5" />
              {elapsed}s elapsed
              {remaining > 0 ? ` · about ${remaining}s remaining` : " · almost there"}
            </span>
            {error === null ? null : (
              <span className="inline-flex items-center gap-1.5 text-amber-600">
                <AlertTriangle aria-hidden className="h-3.5 w-3.5" />
                Connection issue — retrying…
              </span>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
