import { Rss, Share2, ShieldCheck, Terminal } from "lucide-react";
import Image from "next/image";

import { Container } from "./primitives";

const COLUMNS = [
  {
    title: "Intelligence",
    links: [
      { label: "Autonomous audits", href: "#features" },
      { label: "SERP simulator", href: "#audit-preview" },
      { label: "Internal PageRank graph", href: "#features" },
      { label: "Core Web Vitals engine", href: "#features" },
    ],
  },
  {
    title: "Platform",
    links: [
      { label: "Methodology", href: "#how-it-works" },
      { label: "Technical FAQ", href: "#faq" },
      { label: "How it works", href: "#how-it-works" },
    ],
  },
];

const CONNECT = [
  { icon: Share2, label: "Hub", href: "#" },
  { icon: Terminal, label: "CLI", href: "#" },
  { icon: Rss, label: "Changelog", href: "#" },
];

export function SiteFooter() {
  return (
    <footer className="w-full bg-ink-lowest pb-8 pt-16">
      <Container>
        <div className="grid grid-cols-1 gap-10 pb-10 md:grid-cols-5">
          <div className="space-y-4 md:col-span-2">
            <div className="flex items-center gap-2.5">
              <Image
                src="/logo-mark.svg"
                alt=""
                width={28}
                height={28}
                className="h-7 w-7"
              />
              <span className="font-display text-[22px] tracking-tight text-bone">
                Rostify
              </span>
            </div>
            <p className="max-w-sm text-[15px] leading-relaxed text-clay">
              Venture-scale technical SEO auditing and algorithmic intelligence
              platform. Unmask indexation vulnerabilities and crawl anomalies
              with autonomous precision.
            </p>
            <div className="inline-flex items-center gap-2 rounded-full bg-ink-high px-4 py-1">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
              <span className="text-[11px] text-bone">All systems operational</span>
              <span className="ml-2 text-[11px] text-clay">• Crawlers active</span>
            </div>
          </div>

          {COLUMNS.map((column) => (
            <div key={column.title}>
              <div className="mb-4 text-sm font-semibold uppercase tracking-wider text-bone">
                {column.title}
              </div>
              <ul className="space-y-2">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={link.href}
                      className="text-[13px] text-clay transition-colors hover:text-bone"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div>
            <div className="mb-4 text-sm font-semibold uppercase tracking-wider text-bone">
              Connect
            </div>
            <ul className="space-y-2">
              {CONNECT.map(({ icon: Icon, label }) => (
                <li
                  key={label}
                  className="flex items-center gap-1.5 text-[13px] text-clay"
                >
                  <Icon aria-hidden className="h-3.5 w-3.5" />
                  {label}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="flex flex-col gap-4 border-t border-white/[0.06] pt-6 text-[11px] text-clay sm:flex-row sm:items-center sm:justify-between">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck aria-hidden className="h-3.5 w-3.5 text-emerald-400" />
            Security reviewed
          </span>
          <span>© 2025 Rostify Technologies Inc. Precision search architecture.</span>
          <div className="flex flex-wrap gap-4">
            <span>Privacy framework</span>
            <span>Terms of service</span>
            <span>Security protocols</span>
          </div>
        </div>
      </Container>
    </footer>
  );
}
