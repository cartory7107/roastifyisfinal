import type { AuditStatus, AuditStep } from "@rostify/shared";
import { Check, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

type ProgressStepsProps = {
  currentStep: AuditStep | null;
  status: AuditStatus;
  className?: string;
};

/**
 * Spec §11: five high-level steps while the audit runs. The pipeline reports
 * fine-grained steps; each one is mapped onto the step the user actually sees.
 */
const GROUPS: { label: string; detail: string; steps: AuditStep[] }[] = [
  {
    label: "Analyzing website",
    detail: "Loading the page, robots.txt and sitemap.",
    steps: ["crawl_target"],
  },
  {
    label: "Finding competitors",
    detail: "Detecting the niche and the two closest search rivals.",
    steps: ["niche"],
  },
  {
    label: "Deep crawling",
    detail: "Crawling rivals, running Lighthouse and reading backlinks.",
    steps: [
      "technical",
      "ai_readiness",
      "performance",
      "competitor",
      "crawl_competitors",
    ],
  },
  {
    label: "Running 6-category audit",
    detail: "Scoring technical, on-page, content, speed, authority and AI readiness.",
    steps: ["onpage", "content", "offpage", "vision"],
  },
  {
    label: "Generating report",
    detail: "Weighting the score and writing the executive summary.",
    steps: ["synthesize", "pdf"],
  },
];

function activeIndex(currentStep: AuditStep | null): number {
  if (currentStep === null) return 0;
  const index = GROUPS.findIndex((group) => group.steps.includes(currentStep));
  return index === -1 ? 0 : index;
}

export function ProgressSteps({ currentStep, status, className }: ProgressStepsProps) {
  const active = status === "completed" ? GROUPS.length : activeIndex(currentStep);

  return (
    <ol className={cn("space-y-1", className)}>
      {GROUPS.map((group, index) => {
        const done = index < active;
        const running = index === active && status !== "completed";

        return (
          <li
            key={group.label}
            className={cn(
              "flex gap-4 rounded-xl p-4 transition-colors",
              running && "bg-secondary/70",
            )}
            aria-current={running ? "step" : undefined}
          >
            <div
              className={cn(
                "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                done && "border-primary bg-primary text-primary-foreground",
                running && "border-primary bg-background text-primary",
                !done && !running && "border-border bg-background text-muted-foreground",
              )}
            >
              {done ? (
                <Check aria-hidden className="h-4 w-4" />
              ) : running ? (
                <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
              ) : (
                index + 1
              )}
            </div>
            <div className="min-w-0">
              <p
                className={cn(
                  "text-sm font-medium",
                  !done && !running && "text-muted-foreground",
                )}
              >
                {group.label}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                {group.detail}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
