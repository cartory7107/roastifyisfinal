import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type SectionCardProps = {
  id?: string;
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
};

/**
 * One numbered section of the report. Keeping the shell in a single component
 * makes the print view and the live view share identical structure.
 */
export function SectionCard({
  id,
  eyebrow,
  title,
  description,
  actions,
  children,
  className,
}: SectionCardProps) {
  return (
    <section
      id={id}
      className={cn(
        "report-section print-break rounded-2xl border border-border bg-background p-6 shadow-sm sm:p-8",
        className,
      )}
    >
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {eyebrow ? (
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
              {eyebrow}
            </p>
          ) : null}
          <h2 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">
            {title}
          </h2>
          {description ? (
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </header>
      {children}
    </section>
  );
}
