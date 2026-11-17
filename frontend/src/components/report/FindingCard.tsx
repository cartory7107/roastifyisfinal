import type { Finding } from "@rostify/shared";
import { ArrowRight, Wrench } from "lucide-react";

import { categoryLabel, SEVERITY_META } from "@/lib/report";
import { cn } from "@/lib/utils";

import { EvidenceBlock } from "./EvidenceBlock";

type FindingCardProps = {
  finding: Finding;
  /** Hide the category line inside a category section that already states it. */
  showCategory?: boolean;
  className?: string;
};

export function FindingCard({
  finding,
  showCategory = true,
  className,
}: FindingCardProps) {
  const severity = SEVERITY_META[finding.severity];

  return (
    <article
      className={cn(
        "print-break rounded-xl border border-border border-l-4 bg-card p-5 shadow-sm",
        severity.accent,
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
            severity.badge,
          )}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", severity.dot)} />
          {severity.label}
        </span>
        {showCategory ? (
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {categoryLabel(finding.category)}
          </span>
        ) : null}
      </div>

      <h4 className="mt-2.5 text-base font-semibold leading-snug">
        {finding.issue}
      </h4>
      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
        {finding.detail}
      </p>

      <div className="mt-4 rounded-lg border border-border bg-secondary/50 p-3.5">
        <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          <Wrench aria-hidden className="h-3.5 w-3.5" />
          How to fix it
        </p>
        <p className="mt-1.5 text-sm leading-relaxed">{finding.recommendation}</p>
      </div>

      {finding.evidence ? <EvidenceBlock data={finding.evidence} /> : null}
    </article>
  );
}

/** Compact "what this means" line used above a stack of findings. */
export function FindingsHeading({
  count,
  hint,
}: {
  count: number;
  hint?: string;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        <ArrowRight aria-hidden className="h-4 w-4" />
        {count} finding{count === 1 ? "" : "s"}
      </h3>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
