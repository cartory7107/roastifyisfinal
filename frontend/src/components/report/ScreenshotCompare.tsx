/* eslint-disable @next/next/no-img-element */
import type { FinalReport } from "@rostify/shared";
import { ExternalLink } from "lucide-react";

import { hostOf } from "@/lib/report";
import { cn } from "@/lib/utils";

type ScreenshotCompareProps = {
  screenshots: FinalReport["screenshots"];
  /** Hostname of the audited site, used to label the target captures. */
  siteHost?: string;
  className?: string;
};

function Frame({
  src,
  label,
  sublabel,
  tone = "muted",
}: {
  src: string;
  label: string;
  sublabel?: string;
  tone?: "target" | "competitor" | "muted";
}) {
  return (
    <figure
      className={cn(
        "print-break overflow-hidden rounded-xl border bg-card shadow-sm",
        tone === "target" ? "border-primary/40 ring-1 ring-primary/20" : "border-border",
      )}
    >
      <div className="flex items-center gap-2 border-b border-border bg-secondary/60 px-3 py-2">
        <span className="flex gap-1" aria-hidden>
          <span className="h-2 w-2 rounded-full bg-red-400" />
          <span className="h-2 w-2 rounded-full bg-amber-400" />
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
        </span>
        <span className="truncate text-xs font-medium">{label}</span>
        <a
          href={src}
          target="_blank"
          rel="noreferrer"
          className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          Full size
          <ExternalLink aria-hidden className="h-3 w-3" />
        </a>
      </div>
      <img
        src={src}
        alt={`${label} screenshot`}
        loading="lazy"
        className="block w-full bg-secondary/40 object-cover object-top"
      />
      {sublabel ? (
        <figcaption className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
          {sublabel}
        </figcaption>
      ) : null}
    </figure>
  );
}

/** Mobile comparison + the target desktop capture (spec §11). */
export function ScreenshotCompare({
  screenshots,
  siteHost,
  className,
}: ScreenshotCompareProps) {
  const { target, competitors } = screenshots;

  return (
    <div className={cn("space-y-6", className)}>
      <div>
        <h3 className="mb-3 text-sm font-semibold">Desktop — your site</h3>
        <Frame
          src={target.desktop}
          label={siteHost ?? "Target"}
          sublabel="Captured at 1440×900 before the audit ran."
          tone="target"
        />
      </div>

      <div>
        <h3 className="mb-1 text-sm font-semibold">
          Mobile — you versus the competitors that outrank you
        </h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Mobile-first layouts decide most of the ranking gap. Compare the fold,
          the headline, and the primary call to action.
        </p>
        <div
          className={cn(
            "grid gap-4",
            competitors.length === 0
              ? "max-w-xs"
              : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
          )}
        >
          <Frame
            src={target.mobile}
            label={siteHost ? `${siteHost} (you)` : "Your site"}
            tone="target"
          />
          {competitors.map((competitor) => (
            <Frame
              key={competitor.url}
              src={competitor.mobile}
              label={hostOf(competitor.url)}
              sublabel={competitor.url}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
