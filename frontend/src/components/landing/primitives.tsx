import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Shared page gutter so every marketing section lines up on the same grid. */
export function Container({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-7xl px-6 sm:px-8", className)}>
      {children}
    </div>
  );
}

/** Small ember kicker that sits above a section headline. */
export function Eyebrow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cn(
        "text-[11px] font-semibold uppercase tracking-[0.14em] text-ember",
        className,
      )}
    >
      {children}
    </p>
  );
}
