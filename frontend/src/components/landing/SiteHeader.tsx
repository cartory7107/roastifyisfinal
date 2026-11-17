"use client";

import { ArrowRight, Menu, X } from "lucide-react";
import Image from "next/image";
import * as React from "react";

import { cn } from "@/lib/utils";

import { Container } from "./primitives";

const NAV_LINKS = [
  { href: "#features", label: "Features" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#audit-preview", label: "Audit preview" },
  { href: "#faq", label: "FAQ" },
];

/** Sticky glassmorphic header (design system: 16px blur over 60% charcoal). */
export function SiteHeader() {
  const [open, setOpen] = React.useState(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/[0.06] bg-ink/70 backdrop-blur-xl">
      <Container className="flex h-16 items-center justify-between gap-4">
        <a href="#top" className="flex items-center gap-2.5">
          <Image
            src="/logo-mark.svg"
            alt=""
            width={28}
            height={28}
            className="h-7 w-7"
            priority
          />
          <span className="font-display text-lg tracking-tight text-bone">
            Rostify
          </span>
        </a>

        <nav aria-label="Primary" className="hidden items-center gap-7 lg:flex">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-sm text-clay transition-colors hover:text-bone"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <a
            href="#audit-preview"
            className="hidden items-center gap-1.5 rounded-full bg-ember px-4 py-2 text-sm font-semibold text-ink transition-shadow hover:shadow-[0_0_24px_rgba(249,115,22,0.45)] sm:inline-flex"
          >
            Start free audit
            <ArrowRight aria-hidden className="h-4 w-4" />
          </a>

          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? "Close menu" : "Open menu"}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-bone transition-colors hover:bg-white/[0.08] lg:hidden"
          >
            {open ? (
              <X aria-hidden className="h-4 w-4" />
            ) : (
              <Menu aria-hidden className="h-4 w-4" />
            )}
          </button>
        </div>
      </Container>

      <div
        id="mobile-nav"
        className={cn(
          "overflow-hidden border-t border-white/[0.06] bg-ink/95 backdrop-blur-xl lg:hidden",
          open ? "block" : "hidden",
        )}
      >
        <Container className="flex flex-col py-2">
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="rounded-lg px-2 py-3 text-sm text-clay transition-colors hover:bg-white/[0.04] hover:text-bone"
            >
              {link.label}
            </a>
          ))}
        </Container>
      </div>
    </header>
  );
}
