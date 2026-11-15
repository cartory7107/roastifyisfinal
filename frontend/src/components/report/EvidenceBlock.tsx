import { cn } from "@/lib/utils";

type EvidenceBlockProps = {
  data: unknown;
  label?: string;
  className?: string;
};

/** Collapsible raw evidence (metrics, thresholds, samples) for one finding. */
export function EvidenceBlock({
  data,
  label = "Evidence",
  className,
}: EvidenceBlockProps) {
  const text =
    typeof data === "string" ? data : JSON.stringify(data, null, 2);

  return (
    <details
      className={cn(
        "group mt-3 rounded-lg border border-border bg-secondary/50",
        className,
      )}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
        <span
          aria-hidden
          className="text-[10px] transition-transform group-open:rotate-90"
        >
          ▶
        </span>
        {label}
      </summary>
      <pre className="max-h-64 overflow-auto border-t border-border px-3 py-2 text-[11px] leading-relaxed text-foreground/80">
        {text}
      </pre>
    </details>
  );
}
