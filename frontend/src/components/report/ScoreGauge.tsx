import type { Grade } from "@rostify/shared";

import { scoreBand } from "@/lib/report";
import { cn } from "@/lib/utils";

type ScoreGaugeProps = {
  score: number;
  grade: Grade;
  size?: number;
  className?: string;
};

/** Big circular 0-100 gauge (spec §11) — green / amber / red by band. */
export function ScoreGauge({ score, grade, size = 196, className }: ScoreGaugeProps) {
  const clamped = Math.min(100, Math.max(0, Math.round(score)));
  const band = scoreBand(clamped);
  const strokeWidth = size >= 160 ? 14 : 9;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = (clamped / 100) * circumference;
  const center = size / 2;

  return (
    <div
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center",
        className,
      )}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        role="img"
        aria-label={`Overall score ${clamped} out of 100, grade ${grade}`}
      >
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="hsl(var(--border))"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={band.stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-5xl font-semibold leading-none tracking-tight tabular-nums">
          {clamped}
        </span>
        <span className="mt-1.5 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          out of 100
        </span>
      </div>
    </div>
  );
}

export function GradeBadge({ grade }: { grade: Grade }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-xs font-semibold shadow-sm">
      <span className="text-muted-foreground">Grade</span>
      <span className="text-base leading-none">{grade}</span>
    </span>
  );
}
