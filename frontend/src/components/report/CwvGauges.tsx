import { asNumber } from "@/lib/report";
import { cn } from "@/lib/utils";

type CwvGaugesProps = {
  metrics: Record<string, unknown>;
};

type CwvSpec = {
  key: string;
  label: string;
  target: string;
  max: number;
  goodMax: number;
  poorMin: number;
  digits: number;
  unit: string;
};

const SPECS: CwvSpec[] = [
  {
    key: "lcp_seconds",
    label: "LCP",
    target: "Largest Contentful Paint · target ≤ 2.5s",
    max: 6,
    goodMax: 2.5,
    poorMin: 4,
    digits: 2,
    unit: "s",
  },
  {
    key: "inp_ms",
    label: "INP",
    target: "Interaction to Next Paint · target ≤ 200ms",
    max: 800,
    goodMax: 200,
    poorMin: 500,
    digits: 0,
    unit: "ms",
  },
  {
    key: "cls",
    label: "CLS",
    target: "Cumulative Layout Shift · target ≤ 0.10",
    max: 0.4,
    goodMax: 0.1,
    poorMin: 0.25,
    digits: 2,
    unit: "",
  },
];

function rating(value: number, spec: CwvSpec): "good" | "ok" | "poor" {
  if (value <= spec.goodMax) return "good";
  if (value < spec.poorMin) return "ok";
  return "poor";
}

const COLORS = {
  good: { stroke: "#10b981", text: "text-emerald-700", label: "Good" },
  ok: { stroke: "#f59e0b", text: "text-amber-700", label: "Needs work" },
  poor: { stroke: "#ef4444", text: "text-red-700", label: "Poor" },
} as const;

function MiniGauge({ spec, value }: { spec: CwvSpec; value: number | null }) {
  const size = 104;
  const strokeWidth = 9;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  if (value === null) {
    return (
      <div className="flex flex-col items-center gap-2">
        <div
          className="relative flex items-center justify-center rounded-full border-[9px] border-secondary"
          style={{ width: size, height: size }}
        >
          <span className="text-sm font-semibold text-muted-foreground">n/a</span>
        </div>
        <span className="text-sm font-semibold">{spec.label}</span>
        <span className="text-center text-[11px] leading-snug text-muted-foreground">
          {spec.target}
        </span>
      </div>
    );
  }

  const band = COLORS[rating(value, spec)];
  const fraction = Math.min(1, value / spec.max);
  const dash = fraction * circumference;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="-rotate-90"
          role="img"
          aria-label={`${spec.label} ${value}${spec.unit}, ${band.label}`}
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
          <span className="text-lg font-semibold tabular-nums">
            {value.toFixed(spec.digits)}
            <span className="ml-0.5 text-[11px] font-medium text-muted-foreground">
              {spec.unit}
            </span>
          </span>
          <span className={cn("text-[11px] font-semibold", band.text)}>
            {band.label}
          </span>
        </div>
      </div>
      <span className="text-sm font-semibold">{spec.label}</span>
      <span className="max-w-[11rem] text-center text-[11px] leading-snug text-muted-foreground">
        {spec.target}
      </span>
    </div>
  );
}

/** Three Core Web Vitals mini gauges (spec §11). */
export function CwvGauges({ metrics }: CwvGaugesProps) {
  return (
    <div className="grid grid-cols-1 gap-6 rounded-xl border border-border bg-card p-6 shadow-sm sm:grid-cols-3">
      {SPECS.map((spec) => (
        <MiniGauge
          key={spec.key}
          spec={spec}
          value={asNumber(metrics[spec.key])}
        />
      ))}
    </div>
  );
}
