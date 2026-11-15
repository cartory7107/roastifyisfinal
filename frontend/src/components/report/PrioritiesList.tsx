import { ArrowUpRight, Target } from "lucide-react";

import type { Priority } from "@/lib/report";
import { cn } from "@/lib/utils";

type PrioritiesListProps = {
  priorities: Priority[];
  className?: string;
};

/** The three fixes with the highest expected impact (spec §11). */
export function PrioritiesList({ priorities, className }: PrioritiesListProps) {
  if (priorities.length === 0) {
    return (
      <p className={cn("text-sm text-muted-foreground", className)}>
        No priority actions were generated for this audit.
      </p>
    );
  }

  return (
    <ol className={cn("grid gap-4 md:grid-cols-3", className)}>
      {priorities.map((priority, index) => (
        <li
          key={`${priority.title}-${index}`}
          className="print-break flex flex-col rounded-xl border border-border bg-card p-5 shadow-sm"
        >
          <div className="flex items-center justify-between">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary"
              aria-label={`Priority ${index + 1}`}
            >
              {index + 1}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary/60 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              <Target aria-hidden className="h-3 w-3" />
              {priority.category}
            </span>
          </div>

          <h3 className="mt-3 text-sm font-semibold leading-snug">
            {priority.title}
          </h3>
          <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
            {priority.why}
          </p>
          <span className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-primary">
            Fix this first
            <ArrowUpRight aria-hidden className="h-3.5 w-3.5" />
          </span>
        </li>
      ))}
    </ol>
  );
}
