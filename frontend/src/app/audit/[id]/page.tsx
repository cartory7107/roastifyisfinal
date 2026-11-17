"use client";

import type { AuditPollResponse } from "@rostify/shared";
import { AlertTriangle, ArrowLeft, Clock, Loader2, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import * as React from "react";

import { ProgressSteps } from "@/components/report/ProgressSteps";
import { ReportView } from "@/components/report/ReportView";
import { getAudit, runAudit, type ApiError } from "@/lib/api";
import { hostOf } from "@/lib/report";

const POLL_INTERVAL_MS = 2000;
/** Typical wall-clock time for one audit; only used to reassure, never enforced. */
const ESTIMATED_SECONDS = 120;

export default function AuditPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const auditId = typeof params.id === "string" ? params.id : params.id[0];

  const [data, setData] = React.useState<AuditPollResponse | null>(null);
  const [error, setError] = React.useState<ApiError | null>(null);
  const [elapsed, setElapsed] = React.useState(0);
  const [retrying, setRetrying] = React.useState(false);
  const [retryError, setRetryError] = React.useState<string | null>(null);

  const isSettled =
    data !== null && (data.status === "completed" || data.status === "failed");

  // Poll until the audit reaches a terminal state. A failed request keeps the
  // loop alive: transient network errors should not kill a two-minute audit.
  React.useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    // A retry reuses this route with a new id, so drop the previous result
    // instead of showing the old failed audit under the new one.
    setData(null);
    setError(null);
    setElapsed(0);
    setRetrying(false);
    setRetryError(null);

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

  /** Re-run the same URL after a failure (spec §11: failed status + retry). */
  async function handleRetry() {
    const target = data?.targetUrl;
    if (target === undefined || target === "") return;

    setRetrying(true);
    setRetryError(null);

    try {
      const { auditId: nextId } = await runAudit(target);
      router.push(`/audit/${nextId}`);
    } catch (err) {
      setRetryError(
        (err as ApiError).message || "Could not start a new audit. Try again.",
      );
      setRetrying(false);
    }
  }

  // A report can exist on a `failed` row: the pipeline persists it before the
  // final PDF stage, so a late failure must not hide a complete audit.
  const report = data?.result ?? null;
  const hasReport =
    report !== null && (data?.status === "completed" || data?.status === "failed");

  if (data !== null && hasReport) {
    return (
      <main className="min-h-screen bg-secondary/30">
        <ReportView
          auditId={data.id}
          report={report}
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
  const canRetry = data?.status === "failed";

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

          {canRetry ? (
            <p className="mt-3 break-all rounded-lg border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
              {data?.targetUrl}
            </p>
          ) : null}

          <div className="mt-5 flex flex-wrap items-center gap-2">
            {canRetry ? (
              <button
                type="button"
                onClick={() => void handleRetry()}
                disabled={retrying}
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {retrying ? (
                  <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw aria-hidden className="h-4 w-4" />
                )}
                {retrying ? "Starting…" : "Run this audit again"}
              </button>
            ) : null}
            <Link
              href="/"
              className={
                canRetry
                  ? "inline-flex h-9 items-center rounded-md border border-input bg-background px-4 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
                  : "inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90"
              }
            >
              Try another URL
            </Link>
          </div>

          {retryError === null ? null : (
            <p className="mt-3 text-xs text-destructive">{retryError}</p>
          )}
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
