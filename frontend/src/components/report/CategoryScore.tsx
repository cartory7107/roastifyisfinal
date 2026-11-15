import Link from "next/link";

import { scoreBand } from "@/lib/report";
import { cn } from "@/lib/utils";

type CategoryScoreProps = {
  label: string;
  score: number;
  href: string;
  findingCount: number;
  className?: string;
};

/** One colour-coded row per category; clicking jumps to its section (spec §11). */
export function CategoryScore({
  label,
  score,
  href,
  findingCount,
  className,
}: CategoryScoreProps) {
  const clamped = Math.min(100, Math.max(0, Math.round(score)));
  const band = scoreBand(clamped);

  return (
    <Link
      href={href}
      className={cn(
        "group flex items-center gap-4 rounded-lg px-2 py-2.5 transition-colors hover:bg-secondary/70 focus-visible:bg-secondary/70 focus-visible:outline-none",
        className,
      )}
    >
      <span className="w-40 shrink-0 text-sm font-medium sm:w-48">{label}</span>
      <span className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-secondary">
        <span
          className={cn("absolute inset-y-0 left-0 rounded-full", band.bar)}
          style={{ width: `${clamped}%` }}
        />
      </span>
      <span className="w-10 shrink-0 text-right text-sm font-semibold tabular-nums">
        {clamped}
      </span>
      <span className="hidden w-24 shrink-0 text-right text-xs text-muted-foreground sm:block">
        {findingCount === 0
          ? "No issues"
          : `${findingCount} issue${findingCount === 1 ? "" : "s"}`}
      </span>
    </Link>
  );
}
