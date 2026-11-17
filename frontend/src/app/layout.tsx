import type { Metadata } from "next";
import { Hanken_Grotesk, Newsreader } from "next/font/google";
import "./globals.css";

/** Body copy and UI chrome: precise grotesque. */
const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  variable: "--font-hanken",
  display: "swap",
});

/** Editorial headlines: optical serif with a true italic for accents. */
const newsreader = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-newsreader",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Rostify — Instant AI Website Audit",
  description:
    "Submit a URL and get a competitive SEO, content and UI/UX audit in seconds.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body
        className={`${hanken.variable} ${newsreader.variable} font-sans`}
      >
        {children}
      </body>
    </html>
  );
}
