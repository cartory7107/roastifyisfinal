"use client";

import { Check, CheckCircle2 } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

import { Container, Eyebrow } from "./primitives";

type Tier = {
  name: string;
  monthly: number;
  yearly: number;
  blurb: string;
  features: string[];
  cta: string;
  featured?: boolean;
};

const TIERS: Tier[] = [
  {
    name: "Starter",
    monthly: 29,
    yearly: 23,
    blurb: "For indie makers, solo builders, and early-stage personal projects.",
    features: [
      "5 active websites",
      "10,000 crawled pages / month",
      "Weekly automated health audits",
      "Basic technical issue reports",
    ],
    cta: "Start Starter trial",
  },
  {
    name: "Pro Growth",
    monthly: 79,
    yearly: 63,
    blurb:
      "For scaling SaaS businesses, venture-backed startups, and growing product teams.",
    features: [
      "25 active websites",
      "100,000 crawled pages / month",
      "Daily automated health audits",
      "AI automated code & copy fix engine",
      "Slack & Discord instant alerts",
    ],
    cta: "Start 14-day free Pro trial",
    featured: true,
  },
  {
    name: "Agency & Enterprise",
    monthly: 199,
    yearly: 159,
    blurb: "For agencies, conglomerates, and high-frequency technical operations.",
    features: [
      "Unlimited active websites",
      "1,000,000 crawled pages / month",
      "White-label custom client PDF reports",
      "Full REST API & webhook access",
      "Dedicated technical account engineer",
    ],
    cta: "Contact enterprise sales",
  },
];

export function Pricing() {
  const [yearly, setYearly] = React.useState(false);

  return (
    <section id="pricing" className="w-full scroll-mt-24 py-14">
      <Container>
        <div className="mb-8 flex flex-col items-center text-center">
          <Eyebrow className="mb-1">Simple &amp; predictable</Eyebrow>
          <h2 className="mb-4 max-w-2xl font-display text-[28px] leading-[36px] tracking-tight text-bone sm:text-[40px] sm:leading-[48px]">
            Invest in organic growth that compounds perpetually
          </h2>

          <div
            role="group"
            aria-label="Billing period"
            className="inline-flex items-center gap-2 rounded-full bg-ink-card p-1 shadow-inner"
          >
            <button
              type="button"
              onClick={() => setYearly(false)}
              aria-pressed={!yearly}
              className={cn(
                "rounded-full px-4 py-1.5 text-[11px] transition-all",
                yearly
                  ? "font-medium text-clay hover:text-bone"
                  : "bg-ember font-semibold text-ember-ink",
              )}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setYearly(true)}
              aria-pressed={yearly}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-4 py-1.5 text-[11px] transition-all",
                yearly
                  ? "bg-ember font-semibold text-ember-ink"
                  : "font-medium text-clay hover:text-bone",
              )}
            >
              Yearly
              <span className="rounded-full bg-ember/20 px-1.5 py-0.5 text-[10px] font-bold text-ember">
                Save 20%
              </span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 items-stretch gap-6 md:grid-cols-3">
          {TIERS.map((tier) => (
            <div
              key={tier.name}
              className={cn(
                "relative flex flex-col justify-between rounded-2xl p-6 shadow-sm transition-colors sm:p-8",
                tier.featured
                  ? "bg-ink-card shadow-2xl md:-translate-y-2"
                  : "bg-ink-low hover:bg-ink-card",
              )}
            >
              {tier.featured ? (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-ember px-4 py-0.5 text-[11px] font-bold uppercase tracking-wider text-ember-ink shadow-sm">
                  Most popular
                </span>
              ) : null}

              <div>
                <div
                  className={cn(
                    "mb-1 text-xs font-semibold uppercase tracking-wider",
                    tier.featured ? "text-ember" : "text-clay",
                  )}
                >
                  {tier.name}
                </div>
                <div className="mb-2 flex items-baseline gap-1">
                  <span className="font-display text-[56px] font-bold leading-none text-bone">
                    ${yearly ? tier.yearly : tier.monthly}
                  </span>
                  <span className="text-[13px] text-clay">
                    /month{yearly ? ", billed yearly" : ""}
                  </span>
                </div>
                <p className="mb-6 text-[13px] leading-relaxed text-clay">
                  {tier.blurb}
                </p>

                <ul className="mb-6 space-y-2">
                  {tier.features.map((feature) => {
                    const Icon = tier.featured ? CheckCircle2 : Check;
                    return (
                      <li
                        key={feature}
                        className="flex items-center gap-1.5 text-[13px] text-bone"
                      >
                        <Icon
                          aria-hidden
                          className="h-[18px] w-[18px] shrink-0 text-ember"
                        />
                        <span className={tier.featured ? "font-semibold" : ""}>
                          {feature}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>

              <a
                href="#audit-preview"
                className={cn(
                  "inline-flex w-full items-center justify-center rounded-full py-2.5 text-xs font-semibold transition-colors",
                  tier.featured
                    ? "bg-ember text-ember-ink shadow-[0_0_20px_rgba(249,115,22,0.3)] hover:bg-ember/90"
                    : "bg-ink-high text-bone hover:bg-ink-highest",
                )}
              >
                {tier.cta}
              </a>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
