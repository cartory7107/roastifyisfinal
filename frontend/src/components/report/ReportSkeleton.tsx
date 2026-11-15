/**
 * Route-level placeholder for the report pages (spec §13, phase 12). Mirrors
 * the shape of `ReportView` so a slow navigation — or the server fetch behind
 * the print view — shows the document skeleton instead of a blank screen.
 */
export function ReportSkeleton() {
  return (
    <div
      aria-busy
      aria-live="polite"
      className="mx-auto w-full max-w-5xl animate-pulse space-y-6 px-4 py-8 sm:px-6 sm:py-12"
    >
      <span className="sr-only">Loading audit report…</span>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 no-print">
        <div className="space-y-3">
          <div className="h-3 w-28 rounded bg-secondary" />
          <div className="h-7 w-64 rounded bg-secondary" />
          <div className="h-3 w-48 rounded bg-secondary" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-28 rounded-md bg-secondary" />
          <div className="h-9 w-32 rounded-md bg-secondary" />
        </div>
      </div>

      {/* Score hero */}
      <div className="rounded-2xl border border-border bg-background p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-8 sm:flex-row sm:items-center">
          <div className="h-32 w-32 shrink-0 self-center rounded-full bg-secondary sm:self-auto" />
          <div className="flex-1 space-y-3">
            <div className="h-3 w-40 rounded bg-secondary" />
            <div className="h-5 w-3/4 rounded bg-secondary" />
            <div className="h-3 w-2/3 rounded bg-secondary" />
            <div className="h-20 w-full rounded-xl bg-secondary/70" />
          </div>
        </div>
      </div>

      {/* Scorecard */}
      <div className="rounded-2xl border border-border bg-background p-6 shadow-sm">
        <div className="h-4 w-32 rounded bg-secondary" />
        <div className="mt-5 space-y-3">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="flex items-center gap-3">
              <div className="h-3 w-28 rounded bg-secondary" />
              <div className="h-2 flex-1 rounded-full bg-secondary" />
              <div className="h-3 w-8 rounded bg-secondary" />
            </div>
          ))}
        </div>
      </div>

      {/* Priorities */}
      <div className="rounded-2xl border border-border bg-background p-6 shadow-sm">
        <div className="h-4 w-40 rounded bg-secondary" />
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="h-36 rounded-xl border border-border bg-secondary/40" />
          ))}
        </div>
      </div>

      {/* Category sections */}
      {Array.from({ length: 2 }, (_, index) => (
        <div key={index} className="rounded-2xl border border-border bg-background p-6 shadow-sm">
          <div className="h-3 w-24 rounded bg-secondary" />
          <div className="mt-3 h-5 w-56 rounded bg-secondary" />
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            {Array.from({ length: 4 }, (_, row) => (
              <div key={row} className="h-12 rounded-lg bg-secondary/60" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
