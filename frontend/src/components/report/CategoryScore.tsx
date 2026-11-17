import Link from "next/link";

import { scoreBand } from "@/lib/report";
import { cn } from "@/lib/utils";

type CategoryScoreProps = {
  label: string;
  score: number;
  href: string;
  findingCount: number;
  /** Share of the overall score this category carries, as a fraction. */
  weight?: number;
  className?: string;
};

/** One colour-coded row per category; clicking jumps to its section (spec §11). */
export function CategoryScore({
  label,
  score,
  href,
  findingCount,
  weight,
  className,
}: CategoryScoreProps) {
  const clamped = Math.min(100, Math.max(0, Math.round(score)));
  const band = scoreBand(clamped);

  return (
    <Link
      href={href}
      className={cn(
        "group block rounded-lg px-2.5 py-3 transition-colors hover:bg-secondary/70 focus-visible:bg-secondary/70 focus-visible:outline-none",
        className,
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="truncate text-sm font-medium">{label}</span>
          {weight === undefined ? null : (
            <span
              className="shrink-0 rounded border border-border bg-secondary/70 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground"
              title={`${Math.round(weight * 100)}% of the overall score`}
            >
              {Math.round(weight * 100)}%
            </span>
          )}
        </span>
        <span className="flex shrink-0 items-baseline gap-1.5">
          <span
            className={cn("text-base font-semibold leading-none tabular-nums", band.text)}
          >
            {clamped}
          </span>
          <span className="text-[11px] text-muted-foreground">/100</span>
        </span>
      </div>

      <div className="mt-2 flex items-center gap-3">
        <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-secondary">
          <span
            className={cn(
              "absolute inset-y-0 left-0 rounded-full transition-[width] duration-500",
              band.bar,
            )}
            style={{ width: `${clamped}%` }}
          />
        </span>
        <span
          className={cn(
            "w-20 shrink-0 text-right text-[11px] tabular-nums",
            findingCount === 0 ? "font-medium text-emerald-600" : "text-muted-foreground",
          )}
        >
          {findingCount === 0
            ? "No issues"
            : `${findingCount} issue${findingCount === 1 ? "" : "s"}`}
        </span>
      </div>
    </Link>
  );
}
