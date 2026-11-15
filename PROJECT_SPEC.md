# PROJECT_SPEC.md
# Autonomous Multi-Agent AI Website Audit — Hackathon MVP (v2: Full 6-Category)

> **Single source of truth for the coding agent.**
> এই ফাইলে যা আছে শুধু সেটাই implement করবে। কোনো feature/framework/lib এই ফাইলে না থাকলে user-কে জিজ্ঞেস করবে, নিজে সিদ্ধান্ত নেবে না।
> প্রতিটা phase শেষে user-কে report দেবে এবং next phase-এর অনুমতি নেবে।

---

## 1. Project Goal

**One-liner:** User একটা URL submit করবে → system auto niche detect করবে, 2 direct competitor খুঁজবে, সবগুলো crawl করবে, **6টি ক্যাটাগরিতে (Technical, On-Page, Content, Performance, Off-Page, AI Readiness) audit** করবে, rule-based score (0-100) compute করবে, একটা beautiful comparative report দেখাবে যা PDF-এ download হবে।

**Demo flow:**
1. Landing: URL input
2. Progress: 5-step progress display (live)
3. Report: score gauge + 6 category sections + competitor screenshots + executive summary
4. Download PDF button

**Target demo time:** ≤ 150 সেকেন্ড (2.5 মিনিট) per audit।

---

## 2. Scope

### ✅ IN SCOPE
- Single URL → full 6-category audit
- Auto niche detection (LLM)
- Auto competitor discovery (Serper.dev, top 2)
- Parallel crawl (target + 2 competitors) via Playwright
- 6 category analysts:
  1. Technical (code-only)
  2. On-Page SEO (code-only)
  3. Content (hybrid: code + 1 LLM)
  4. Performance/CWV (code-only, Lighthouse)
  5. Off-Page (code + OpenPageRank API)
  6. AI Readiness (code-only)
- Rule-based scoring (deterministic, no LLM for final score)
- Report UI + PDF download
- Supabase (PostgreSQL + Storage)

### ❌ OUT OF SCOPE
- Authentication, payments, billing
- Queue (BullMQ/Redis) — synchronous async with polling
- WebSocket/SSE — polling only
- Full-page screenshots — viewport only
- Multi-language
- White-label (custom logo/colors)
- Rate limiting
- Admin dashboard
- Historical audit list
- Multi-page deep crawl (homepage only)
- Full backlink toxic analysis (only DA, rest is "Phase 2")
- Email delivery

---

## 3. Tech Stack (Locked)

| Layer | Choice | Version |
|---|---|---|
| Backend Runtime | Node.js | 20.x LTS |
| Backend Language | TypeScript | 5.x |
| Backend Framework | **Fastify** | 4.x |
| Frontend | **Next.js (App Router)** | 14.x |
| Frontend Styling | **Tailwind CSS + shadcn/ui** | latest |
| Browser Automation | **Playwright** | latest |
| PDF | Playwright `page.pdf()` | — |
| DB | **Supabase (PostgreSQL)** | — |
| Storage | **Supabase Storage** | — |
| LLM | **Google Gemini 2.5 Flash** | `@google/genai` |
| SERP API | **Serper.dev** | REST |
| Domain Authority | **OpenPageRank API** (free tier) | REST |
| Performance | **Lighthouse** + **chrome-launcher** | latest |
| robots.txt parser | **robots-parser** | 2.x |
| XML parser | **fast-xml-parser** | 4.x |
| Concurrency | **p-limit** | 5.x |
| Validation | **Zod** | 3.x |
| Package Manager | **pnpm** | 9.x |

---

## 4. Monorepo Structure

```
audit-ai/
├── PROJECT_SPEC.md
├── package.json
├── pnpm-workspace.yaml
├── .env.example
├── .gitignore
├── apps/
│   ├── api/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts                    # Fastify entry
│   │       ├── pipeline.ts                 # orchestrates full audit
│   │       ├── routes/
│   │       │   ├── health.ts
│   │       │   └── audit.ts
│   │       ├── analysts/
│   │       │   ├── technical.ts            # code
│   │       │   ├── on-page.ts              # code
│   │       │   ├── content.ts              # hybrid
│   │       │   ├── performance.ts          # code (Lighthouse)
│   │       │   ├── off-page.ts             # code + OpenPageRank
│   │       │   ├── ai-readiness.ts         # code
│   │       │   ├── niche.ts                # LLM
│   │       │   ├── competitor.ts           # SERP
│   │       │   ├── vision.ts               # LLM (screenshots)
│   │       │   └── synthesizer.ts          # LLM (summary only)
│   │       ├── crawler/
│   │       │   ├── playwright.ts           # crawlUrl()
│   │       │   ├── lighthouse.ts           # runLighthouse()
│   │       │   └── broken-links.ts         # checkBrokenLinks()
│   │       ├── lib/
│   │       │   ├── supabase.ts
│   │       │   ├── gemini.ts
│   │       │   ├── serper.ts
│   │       │   ├── openpagerank.ts
│   │       │   ├── scoring.ts              # ALL math lives here
│   │       │   ├── schemas.ts              # all Zod schemas
│   │       │   └── text-similarity.ts      # Jaccard
│   │       ├── prompts/
│   │       │   ├── niche.ts
│   │       │   ├── content.ts
│   │       │   ├── vision.ts
│   │       │   └── synthesizer.ts
│   │       └── scripts/
│   │           ├── test-crawl.ts
│   │           ├── test-technical.ts
│   │           └── test-full-audit.ts
│   └── web/
│       ├── package.json
│       └── src/
│           ├── app/
│           │   ├── page.tsx                # landing + form
│           │   ├── audit/[id]/page.tsx     # report page
│           │   └── audit/[id]/print/page.tsx
│           ├── components/
│           │   ├── UrlForm.tsx
│           │   ├── ProgressSteps.tsx
│           │   ├── ScoreGauge.tsx
│           │   ├── CategoryScore.tsx       # one row per category
│           │   ├── FindingCard.tsx
│           │   ├── CwvGauges.tsx           # 3 mini gauges
│           │   ├── ScreenshotCompare.tsx
│           │   ├── EvidenceBlock.tsx       # for robots.txt etc.
│           │   └── PrioritiesList.tsx
│           └── lib/api.ts
└── packages/
    └── shared/
        ├── package.json
        └── src/
            ├── types.ts                    # shared domain types
            └── schemas.ts                  # Zod schemas (mirrored)
```

---

## 5. Architecture — Pipeline Execution Order

### 5.1 High-level pipeline

```
POST /audit  (returns auditId immediately, status='running')
  ↓
[STEP A] Crawl TARGET via Playwright
         └→ extracts HTML, meta, headings, body, internal links, screenshots
  ↓
[STEP B] Run in PARALLEL (4 tasks, no dependencies between them):
  ├── B1. Niche Classifier (LLM on target data)
  ├── B2. Technical Analyst (code: robots, sitemap, canonical, redirects, broken links)
  ├── B3. AI Readiness Analyst (code: schema, llms.txt, AI crawler access)
  └── B4. Performance Analyst (Lighthouse on target only — 30-40s)
  ↓
[STEP C] Competitor Hunter (SERP — uses B1's keywords)
  ↓
[STEP D] Crawl COMPETITORS via Playwright (parallel, max 2)
  ↓
[STEP E] Run in PARALLEL (4 tasks):
  ├── E1. On-Page Analyst (code, uses target + competitor data)
  ├── E2. Content Analyst (hybrid: code + LLM for E-E-A-T + gaps)
  ├── E3. Off-Page Analyst (code + OpenPageRank for target + competitors)
  └── E4. Vision Analyst (LLM, screenshot comparison)
  ↓
[STEP F] Synthesizer:
  - Compute all 6 category scores via scoring.ts (CODE)
  - Compute overall score (CODE)
  - Generate executive summary + top priorities (LLM)
  - Save final_report to DB
  ↓
[STEP G] PDF Generation:
  - Playwright opens /audit/{id}/print
  - page.pdf() → upload to Supabase Storage
  - save pdf_url
  ↓
status='completed'
```

### 5.2 Why this order

- **B2, B3, B4 don't need competitors** → they run right after target crawl (fast)
- **B4 (Lighthouse) is the slowest (~40s)** → kicked off early to overlap with A-B-C
- **E1-E4 all need competitor data** → run after D
- **B1 (niche) is on critical path** → C depends on it
- **Only 4 LLM calls per audit:** Niche (B1), Content (E2), Vision (E4), Synthesizer (F)

### 5.3 Estimated timing per audit

| Step | Time |
|---|---|
| A: Crawl target | 10-15s |
| B: Parallel | ~40s (Lighthouse dominates) |
| C: SERP | 3-5s |
| D: Crawl competitors | 20-25s |
| E: Parallel | ~15s (Vision dominates) |
| F: Synthesize | 6-10s |
| G: PDF | 10-15s |
| **Total** | **~110-130s** |

**Timeout:** 180 seconds hard limit. Anything beyond → `status='failed'`, `error_message='Audit timed out'`.

---

## 6. Database Schema (Supabase)

```sql
create table audits (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'pending',
  current_step text,  -- 'crawl_target' | 'niche' | 'technical' | 'ai_readiness'
                      -- | 'performance' | 'competitor' | 'crawl_competitors'
                      -- | 'onpage' | 'content' | 'offpage' | 'vision'
                      -- | 'synthesize' | 'pdf'
  target_url text not null,

  niche jsonb,                    -- { category, location, keywords[] }
  competitors jsonb,              -- [{ url, title, snippet, da }]

  crawl_data jsonb,               -- { target: CrawlData, competitors: CrawlData[] }

  technical_analysis jsonb,       -- CategoryAnalysis
  onpage_analysis jsonb,
  content_analysis jsonb,
  performance_analysis jsonb,
  offpage_analysis jsonb,
  ai_readiness_analysis jsonb,

  final_report jsonb,             -- FinalReport (see §8.7)
  pdf_url text,

  error_message text,
  created_at timestamptz default now(),
  completed_at timestamptz
);

create index audits_status_idx on audits(status);
```

**Storage buckets:**
- `screenshots` — `{audit_id}/{site}-{device}.png` (target and each competitor)
- `reports` — `{audit_id}/report.pdf`

---

## 7. Data Contracts (TypeScript)

### 7.1 CrawlData (from crawler/playwright.ts)

```ts
type CrawlData = {
  url: string;
  finalUrl: string;              // after redirects
  statusCode: number;
  isHttps: boolean;
  redirectCount: number;

  // Meta
  title: string;
  metaDescription: string;
  metaRobots: string | null;
  canonical: string | null;
  viewportMeta: string | null;
  hreflang: string[];
  ogTags: Record<string, string>;

  // Headings
  h1: string[];
  h2: string[];
  h3: string[];

  // Content
  bodyText: string;              // max 3000 words trimmed
  wordCount: number;
  images: { src: string; alt: string | null }[];
  internalLinks: string[];       // same-origin hrefs, absolute, deduped
  externalLinks: string[];

  // Structured data
  jsonLd: unknown[];             // parsed JSON-LD blocks
  microdata: boolean;

  // Files (from separate fetches)
  robotsTxt: string | null;
  sitemapXml: string | null;

  // Screenshots (Supabase URLs after upload)
  screenshotDesktopUrl: string;
  screenshotMobileUrl: string;

  // Timing
  crawledAt: string;
  crawlDurationMs: number;
};
```

### 7.2 CategoryAnalysis (each analyst returns this)

```ts
type Finding = {
  severity: 'critical' | 'high' | 'medium' | 'low';
  category: string;              // which check (e.g., 'missing-meta-description')
  issue: string;                 // 1 short label
  detail: string;                // 1-2 sentences explanation
  recommendation: string;        // actionable fix
  evidence?: Record<string, unknown>;  // raw data
};

type CategoryAnalysis = {
  score: number;                 // 0-100 (computed by code)
  findings: Finding[];
  summary: string;               // 1-2 sentences
  metrics: Record<string, unknown>;  // raw values for UI (e.g., { lcp: 3.2, cls: 0.15 })
};
```

### 7.3 FinalReport

```ts
type FinalReport = {
  overall_score: number;
  grade: 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';
  category_scores: {
    technical: CategoryAnalysis;
    onpage: CategoryAnalysis;
    content: CategoryAnalysis;
    performance: CategoryAnalysis;
    offpage: CategoryAnalysis;
    ai_readiness: CategoryAnalysis;
  };
  executive_summary: string;     // 3-4 sentences from LLM
  top_priorities: { title: string; category: string; why: string }[];
  competitors: { url: string; title: string; da: number | null }[];
  screenshots: {
    target: { desktop: string; mobile: string };
    competitors: { url: string; mobile: string }[];
  };
  meta: {
    url: string;
    audited_at: string;
    duration_ms: number;
  };
};
```

---

## 8. Each Analyst — Detailed Specification

### 8.1 Technical Analyst (`analysts/technical.ts`) — PURE CODE

**Data sources:** `CrawlData` + live fetches (robots.txt already in CrawlData; sitemap fetched separately if not in CrawlData).

**Checks (achievement-based, max 100 points):**

| Check | Points | How |
|---|---|---|
| `robots.txt` exists & valid | 15 | Parse with `robots-parser`. Not 404. |
| `sitemap.xml` exists & valid XML | 15 | Fetch `/sitemap.xml`. Parse with `fast-xml-parser`. Contains `<urlset>` or `<sitemapindex>`. |
| Canonical present & self-referencing | 10 | `canonical` === `finalUrl` (normalized). |
| No accidental `noindex` | 10 | `metaRobots` does not contain `noindex`. |
| Redirect count ≤ 1 | 10 | `redirectCount <= 1`. |
| HTTPS enforced | 10 | `isHttps === true`. |
| Broken links ratio < 10% | 15 | From `checkBrokenLinks()`: HEAD request to first 10 internal links, concurrency 5. |
| No `meta-refresh` redirect | 15 | Check HTML for `<meta http-equiv="refresh">`. |

**Score computation (see §9.1).**

**Findings:** For each failed check, push a `Finding` with appropriate severity:
- `robots.txt` missing → **high**
- `sitemap` missing → **medium**
- Canonical missing → **high**
- `noindex` present → **critical**
- Redirects > 1 → **medium**
- HTTP not HTTPS → **critical**
- Broken links > 10% → **high**
- meta-refresh present → **medium**

**Failure mode:** If a check errors (network timeout), mark as failed with severity **medium** and reason in `evidence`.

---

### 8.2 On-Page Analyst (`analysts/on-page.ts`) — PURE CODE

**Data source:** `CrawlData` (target only, no competitors needed — On-Page is absolute).

**Scoring (max 100):**

```
titleScore (0-25):
  - 25 if 50 ≤ len ≤ 60 AND primaryKeyword in title (case-insensitive)
  - 18 if len in [50,60] but keyword missing, OR keyword present but len slightly off [40,70]
  - 10 if len in [30,40) or (60,80]
  - 0  if empty or len < 30 or len > 80

metaScore (0-15):
  - 15 if 150 ≤ len ≤ 160 AND primaryKeyword in description
  - 10 if 150 ≤ len ≤ 160 without keyword, OR keyword + len [120,180]
  - 5  if len in [80,120) or (160,200]
  - 0  if missing

h1Score (0-20):
  - 20 if exactly 1 H1 AND primaryKeyword in H1
  - 12 if exactly 1 H1 but no keyword
  - 0  if 0 H1 (critical) OR >1 H1 (high)

hierarchyScore (0-15):
  - 15 if H2 count ≥ 2 AND no skipped level (H1→H2→H3 only)
  - 8  if H2 count ≥ 1 but skips present
  - 0  if no H2 at all

internalLinkScore (0-15):
  - 15 if internalLinks.length ≥ 3
  - 8  if 1-2
  - 0  if 0

urlScore (0-10):
  - 10 if URL path depth ≤ 3, no query-string-only navigation, hyphens (not underscores)
  - 5  if partially meets
  - 0  if very deep (>5) or uses underscores or has .php/.html noise
```

**Primary keyword:** niche.keywords[0] from Agent 1 (or fallback: `category` string).

**Total On-Page score:** sum of above (max 100).

**Findings:** One `Finding` per failed sub-check, severity by point-loss:
- Lost ≥15 pts → **critical** or **high**
- Lost 5-14 pts → **medium**
- Lost <5 pts → **low**

**Failure mode:** If `CrawlData` is incomplete (e.g., no HTML extracted), all checks fail → score = 0 with `evidence.reason`.

---

### 8.3 Content Analyst (`analysts/content.ts`) — HYBRID (code + 1 LLM)

**Data source:** `CrawlData.target`, `CrawlData.competitors`.

**Sub-scores (max 100):**

```
eeat_llm_score      (0-30)  ← LLM
wordCountScore      (0-25)
keywordPlacementScore (0-10)
duplicateAvoidanceScore (0-10)
freshnessScore      (0-10)
contentCompletenessScore (0-15)  ← based on gaps found
```

**Code-based sub-scores:**

```
wordCountScore = 25 × min(1, wordCount / 1000)
  // 1000+ words = full marks

keywordPlacementScore:
  keyword appears in first 100 words → 10
  keyword appears in first 200 words → 5
  else → 0

duplicateAvoidanceScore:
  max_sim = max over competitors of jaccardSimilarity(
     wordShingles(target.bodyText, 5),
     wordShingles(competitor.bodyText, 5)
  )
  if max_sim < 0.2 → 10
  if max_sim < 0.4 → 6
  if max_sim < 0.6 → 2
  else → 0   // heavy duplicate

freshnessScore:
  // from copyright year in body text, or Last-Modified header
  current_year = 2026 (or new Date().getFullYear())
  year_in_content ≥ current_year-1 → 10
  year_in_content ≥ current_year-2 → 6
  year_in_content ≥ current_year-3 → 3
  else → 0
```

**Jaccard similarity:**

```ts
function wordShingles(text: string, k = 5): Set<string> {
  const words = text.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean);
  const shingles = new Set<string>();
  for (let i = 0; i <= words.length - k; i++) {
    shingles.add(words.slice(i, i + k).join(' '));
  }
  return shingles;
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const s of a) if (b.has(s)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}
```

**LLM call (1 per audit):**

Prompt in `prompts/content.ts`:

```
You are a senior content strategist auditing one page for E-E-A-T, information
gain and semantic depth. You are auditing, not writing.

TARGET (${url}):
Title: {title}
Body (first 2000 words): {bodyText}

COMPETITORS:
{for each competitor: name, body first 800 words}

STEP 1 — INFORMATION GAIN.
What does the target contain that the competitors do not: original data, a
first-hand process, specific numbers, dated observations, named examples. If
the target adds nothing the competitor set already covers, that is the most
important finding on the page. Length without new information is a liability.

STEP 2 — SEMANTIC DEPTH.
Name the entities, the practitioner predicates, and the entity-attribute-value
pairs present in the competitor bodies but absent from the target. "Add more
detail" is not acceptable.

STEP 3 — E-E-A-T (each component scored 0-10, total x 0.75, capped 30).
  Experience — bio length does not count, demonstrated doing counts.
    8-10 dated first-person accounts, original photos, specific amounts or
         versions, what failed before, counterintuitive findings
    4-6  "in my experience" with no specifics, examples that fit any business
    1-3  desk-research synthesis, "imagine you are...", bio claiming
         experience the body never demonstrates
    Heuristic: count specific, datable, first-person observations. Three or
    more reads strong. Zero or one reads absent, however good the bio is.
  Expertise — states where the advice does not apply, explains the why behind
    each claim, addresses edge cases and trade-offs.
  Authoritativeness — verifiable author identity, page inside a topical
    cluster, accurate in-context citations.
  Trustworthiness — sourced and dated statistics, disclosed commercial
    relationships, methodology stated, last-updated date backed by real edits.
  Red flags that reduce Trustworthiness: Person schema with an author bio that
  demonstrates nothing; review schema with no visible review text; FAQ
  questions phrased as keyword strings; credentials irrelevant to the topic.

STEP 4 — CONTENT GAPS.
Name topic, competitor hostnames covering it, and why it matters for this
business. Max 5. No gap the target already covers.

SEVERITY:
  critical — the page cannot compete as written
  high     — a missing E-E-A-T component or a major topic gap
  medium   — a partial gap or inconsistent signal
  low      — polish
Do not return everything as high.

{ANTI_SLOP_RULES from prompts/anti-slop.ts — evidence rules, banned
vocabulary, banned phrases, banned structural patterns}

OUTPUT strict JSON (no markdown):
{
  "eeat_score": <0-30 integer>,
  "eeat_findings": [
    { "severity": "critical"|"high"|"medium"|"low", "issue": "...", "detail": "...", "recommendation": "..." }
  ],
  "content_gaps": [
    { "topic": "...", "seenOn": ["domain1", "domain2"], "why": "..." }
  ]
}

"issue" is a claim about one specific element, max 90 characters. "detail"
quotes or locates the evidence in the input. "recommendation" names the
change, not the goal.
```

**Content completeness score:**

```
gaps_count = content_gaps.length
contentCompletenessScore:
  0 gaps → 15
  1 gap → 12
  2 gaps → 9
  3 gaps → 6
  4 gaps → 3
  5+ gaps → 0
```

**Total Content score:**

```
contentScore = clamp(
  eeat_llm_score +
  wordCountScore +
  keywordPlacementScore +
  duplicateAvoidanceScore +
  freshnessScore +
  contentCompletenessScore,
  0, 100
)
```

**Failure mode:** If LLM call fails after 3 retries, set `eeat_llm_score = 0`, `content_gaps = []`, add finding "Content analysis partially failed — E-E-A-T could not be evaluated".

---

### 8.4 Performance Analyst (`analysts/performance.ts`) — PURE CODE

**Data source:** Lighthouse run on target only (mobile emulation).

**Lighthouse setup:**

```ts
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';

async function runLighthouse(url: string) {
  const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless'] });
  const result = await lighthouse(url, {
    port: chrome.port,
    output: 'json',
    onlyCategories: ['performance'],
    formFactor: 'mobile',
    screenEmulation: { mobile: true, width: 390, height: 844, deviceScaleFactor: 3 },
  });
  await chrome.kill();
  return result.lhr;
}
```

**Extract from `lhr.audits`:**

- `lcp` = `largest-contentful-paint.numericValue` (ms → seconds)
- `inp` = `interaction-to-next-paint.numericValue` (ms) — or fallback to `total-blocking-time` if INP not available in LHR
- `cls` = `cumulative-layout-shift.numericValue`

**CWV sub-score computation (see §9.4):**

```
lcpScore = f_lcp(lcp_seconds)      // 0-100
inpScore = f_inp(inp_ms)           // 0-100
clsScore = f_cls(cls)              // 0-100
performanceScore = 0.40 × lcpScore + 0.30 × inpScore + 0.30 × clsScore
```

**Findings:**
- `lcp > 4.0` → **critical**
- `lcp > 2.5` → **high**
- `inp > 500` → **critical**
- `inp > 200` → **high**
- `cls > 0.25` → **high**
- `cls > 0.1` → **medium**

**Metrics to save:**

```ts
metrics: {
  lcp_seconds: number,
  inp_ms: number,
  cls: number,
  tbt_ms: number,       // total blocking time
  fcp_seconds: number,
  speed_index_seconds: number,
}
```

**Failure mode:** If Lighthouse fails (chrome launch, network, timeout 60s), set all three metrics to null, score = 0, add finding "Performance could not be measured".

---

### 8.5 Off-Page Analyst (`analysts/off-page.ts`) — CODE + OpenPageRank

**Data source:** OpenPageRank API for target + competitors.

**API call:**

```
GET https://openpagerank.com/api/v1.0/getPageRank?domains[]={domain}
Header: API-OPR: {OPENPAGERANK_API_KEY}
```

Response gives `page_rank_integer` (0-10) per domain.

**Score:**

```
daScore = min(100, openPageRankValue × 10)
// OpenPageRank 0-10 → 0-100

// If target DA is above competitor average:
comparisonBonus = 0  // no bonus, DA is absolute
```

**Off-Page score = daScore (0-100).**

**Findings:**
- `openPageRank < 2` → **high** ("Domain has very low authority")
- `openPageRank < 4` → **medium**
- If competitor avg DA is 2+ points higher than target → **high** finding with recommendation "Build backlinks; competitors avg DA {x} vs yours {y}"

**Metrics:**

```ts
metrics: {
  openPageRank: number,     // 0-10
  competitorsAvg: number,
  domains: [{ url: string, da: number }]
}
```

**Failure mode:** If OpenPageRank API fails or key missing, set score = 40 (neutral), finding "Off-Page analysis limited — API unavailable".

---

### 8.6 AI Readiness Analyst (`analysts/ai-readiness.ts`) — PURE CODE

**Data source:** `CrawlData` (jsonLd, robotsTxt) + live fetch `/llms.txt`.

**Checks (achievement, max 100):**

| Check | Points | How |
|---|---|---|
| JSON-LD schema present | 30 | `jsonLd.length > 0` AND at least one block parses as valid schema.org type |
| `llms.txt` at root exists | 25 | `GET /llms.txt` returns 200 with content-type text/plain |
| AI crawlers not blocked in robots.txt | 25 | Parse robots with `robots-parser`; ensure `GPTBot`, `ClaudeBot`, `Google-Extended`, `CCBot`, `PerplexityBot` are all allowed (`isAllowed(url, 'GPTBot') === true`) |
| Rich result eligibility | 20 | JSON-LD contains one of: `Article`, `FAQPage`, `HowTo`, `Product`, `LocalBusiness`, `Organization`, `BreadcrumbList`, `Recipe`, `Review` |

**Score = sum (max 100).**

**Findings:**
- No schema → **high**
- `llms.txt` missing → **low** (informational)
- AI crawler blocked → **medium** (matters for AI search)
- No rich result type → **medium**

**Metrics:**

```ts
metrics: {
  hasJsonLd: boolean,
  schemaTypes: string[],
  hasLlmsTxt: boolean,
  blockedBots: string[],
  richResultTypes: string[],
}
```

**Failure mode:** If `/llms.txt` fetch errors (500+), treat as missing.

---

### 8.7 Niche Classifier (`analysts/niche.ts`) — LLM

**Data source:** `CrawlData.target`.

**Prompt in `prompts/niche.ts`:**

```
You are a website analyst. Given scraped homepage data, identify the business.

INPUT:
Title: {title}
Meta Description: {metaDescription}
H1: {h1List}
Body excerpt (first 500 words): {bodyText}

OUTPUT strict JSON (no markdown, no commentary):
{
  "category": "short business category e.g. 'digital marketing agency', 'dental clinic'",
  "location": "city, country — default 'Bangladesh' if not detectable",
  "keywords": ["keyword1", "keyword2", "keyword3"]
}

Keywords must be 2-4 words, search-intent oriented, specific to what this business sells.
```

**Zod:**

```ts
NicheSchema = z.object({
  category: z.string().min(3).max(100),
  location: z.string().min(2).max(100),
  keywords: z.array(z.string().min(3).max(80)).length(3),
})
```

**Failure mode:** If LLM fails 3 times with exponential backoff (1s, 2s, 4s), fall back to:
```json
{ "category": "unknown", "location": "Bangladesh", "keywords": ["services", "products", "company"] }
```
…and continue (competitor hunt will be less targeted but pipeline doesn't break).

---

### 8.8 Competitor Hunter (`analysts/competitor.ts`) — SERP

**Data source:** `niche.keywords` + `niche.location`.

**Logic:**

```ts
const BLOCK_LIST = [
  'facebook.com', 'linkedin.com', 'instagram.com', 'youtube.com',
  'twitter.com', 'x.com', 'tiktok.com', 'yelp.com', 'tripadvisor.com',
  'wikipedia.org', 'medium.com', 'reddit.com', 'quora.com',
  'yellowpages.com', 'bbb.org', 'crunchbase.com', 'glassdoor.com',
];

async function huntCompetitors(niche, targetUrl) {
  const targetDomain = new URL(targetUrl).hostname.replace(/^www\./, '');
  const candidates = new Map<string, { url, title, snippet }>();

  for (const keyword of niche.keywords) {
    const query = `${keyword} ${niche.location}`;
    const results = await serperSearch(query, { num: 10 });
    for (const r of results.organic || []) {
      try {
        const domain = new URL(r.link).hostname.replace(/^www\./, '');
        if (domain === targetDomain) continue;
        if (BLOCK_LIST.some(b => domain.endsWith(b))) continue;
        if (!candidates.has(domain)) {
          candidates.set(domain, { url: r.link, title: r.title, snippet: r.snippet });
        }
      } catch {}
    }
  }

  return Array.from(candidates.values()).slice(0, 2);
}
```

**Serper request:**

```
POST https://google.serper.dev/search
Header: X-API-KEY: {SERPER_API_KEY}
Body: { q: "...", num: 10, gl: "bd", hl: "en" }
```

**Failure mode:** If ≤ 1 competitor found after 3 keywords, proceed with 1. If 0 found, set `competitors = []` and skip E1/E2/E4 comparisons (analysts fall back to target-only analysis).

---

### 8.9 Vision Analyst (`analysts/vision.ts`) — LLM

**Data source:** mobile screenshots (base64) of target + competitors. **Resize to max 1024px width before sending.**

**Prompt in `prompts/vision.ts`:**

```
You are auditing the mobile first screen of one site against its competitors.
The screenshots are attached in the stated order; image 1 is the target.

Every judgement must name what can be seen: the element, roughly where it
sits, its relative size, and the words on it.
  Finding:      "the primary CTA 'Get a quote' sits in the top third at
                 roughly 48px tall but carries the same weight as nav links"
  Not a finding: "improve visual hierarchy"

Assess:
- First screen — in two seconds, can a visitor tell what this business sells
  and what to do next. Say what is seen first, second, then third.
- Calls to action — how many compete above the fold, does one dominate.
- Trust — name every trust element visible (badge, review count, guarantee,
  client logo, phone, address), or state that none are.
- Mobile usability — font size, tap target size, line length, density,
  referencing specific elements.
- Gap — what a competitor shows in its first screen that this one does not.

Score 0-100. Above 80 reads as a site you would trust with a card number.
50-70 has the elements but buries them. Below 50, the visitor cannot tell what
is being sold.

{ANTI_SLOP_RULES from prompts/anti-slop.ts}

OUTPUT strict JSON:
{
  "score": <0-100 integer>,
  "findings": [
    { "severity": "critical"|"high"|"medium"|"low", "issue": "...", "detail": "...", "recommendation": "..." }
  ],
  "summary": "2-3 sentence summary naming the strongest and weakest element on screen"
}

Max 5 findings. "issue" is under 90 characters and names an element. "detail"
describes what is visible. "recommendation" names the change.
```

**Score:** LLM returns 0-100; clamped to 0-100. **No further computation.**

**Findings:** As returned; capped at 5.

**Failure mode:** If LLM fails after 3 retries → score = 50 (neutral), findings = [], add finding "Visual analysis unavailable".

---

### 8.10 Synthesizer (`analysts/synthesizer.ts`) — LLM (summary only)

**Data source:** All 6 `CategoryAnalysis` + computed `overall_score` (already calculated by `scoring.ts`).

**Prompt in `prompts/synthesizer.ts`:**

```
You are a senior SEO consultant writing the opening assessment of an audit
report. The reader owns the site, not another SEO. They will give this one page
of attention and it has to earn the rest of the document.

You are not re-scoring anything. Do not reference a metric not in this input.

INPUT:
URL: {url}
Niche: {niche.category} in {niche.location}
Scores:
  Overall: {overall_score}/100 ({grade})
  Technical: {technical.score}
  On-Page: {onpage.score}
  Content: {content.score}
  Performance: {performance.score}
  Off-Page: {offpage.score}
  AI Readiness: {ai_readiness.score}

Top findings per category:
{for each category: bullet list of top 3 findings}

WHAT THE SUMMARY HAS TO DO
1. Name the site's condition in the first sentence, in language a
   non-specialist understands. Give the number, then say what it means for
   this business, not what it means for a search engine.
2. Name the two or three findings costing the most and say what each costs.
   A finding with no consequence attached is filler.
3. If the categories disagree badly, one strong and one weak, say so. That
   pattern is diagnostic and usually the most useful observation in the report.
4. Close with what changes first. Concrete, not directional.

WHAT IT MUST NOT DO
- No "in today's competitive landscape", no "presents both challenges and
  opportunities".
- Do not list the category scores back at the reader. The table is on the page.
- Do not cite anything this audit does not measure: keyword volumes, traffic
  estimates, backlink counts, ranking positions, revenue.
- Do not soften. A 34/100 is a site that is not ranking. Write it as that.

TOP PRIORITIES
Exactly 3, ordered by business impact — not by points available and not by
category order. A one-line fix that unblocks a sale outranks a twenty-point
technical tidy-up no visitor ever sees. Each "why" states the mechanism: what
changes for the business once this is fixed.

{ANTI_SLOP_RULES from prompts/anti-slop.ts}

OUTPUT strict JSON:
{
  "executive_summary": "3-4 sentences. Sentence one is the condition. Then cost, then the first move.",
  "top_priorities": [
    { "title": "the change, under 70 characters", "category": "technical"|"onpage"|"content"|"performance"|"offpage"|"ai_readiness", "why": "1 sentence naming the mechanism" }
  ]
}

Exactly 3 top_priorities, ordered by impact.
```

**Synthesizer does NOT compute scores** — those are already in code.

**Failure mode:** If LLM fails → generic fallback:
```json
{
  "executive_summary": "This website scored {overall_score}/100. See detailed findings below.",
  "top_priorities": []
}
```

---

## 9. Scoring Mathematics (`lib/scoring.ts`)

> **সব final score code-এ compute হবে। LLM কোনো score দেবে না — শুধু sub-score বা findings।**
> This ensures deterministic, reproducible results.

### 9.1 Technical Score

```ts
function technicalScore(data: TechnicalChecks): number {
  let score = 0;
  if (data.robotsExists && data.robotsValid) score += 15;
  if (data.sitemapExists && data.sitemapValid) score += 15;
  if (data.canonicalIsSelf) score += 10;
  if (!data.noindex) score += 10;
  if (data.redirectCount <= 1) score += 10;
  if (data.isHttps) score += 10;
  if (data.brokenRatio < 0.10) score += 15;
  if (!data.metaRefresh) score += 15;
  return clamp(score, 0, 100);
}
```

### 9.2 On-Page Score

```ts
function onPageScore(f: OnPageFacts): number {
  return clamp(
    titlePoints(f.title, f.primaryKeyword) +
    metaPoints(f.metaDescription, f.primaryKeyword) +
    h1Points(f.h1, f.primaryKeyword) +
    hierarchyPoints(f.h2, f.h3) +
    internalLinkPoints(f.internalLinkCount) +
    urlPoints(f.url),
    0, 100
  );
}
```

**Helper functions:**

```ts
function titlePoints(title: string, kw: string): number {
  const len = title.trim().length;
  if (!len) return 0;
  const hasKw = title.toLowerCase().includes(kw.toLowerCase());
  if (len >= 50 && len <= 60 && hasKw) return 25;
  if ((len >= 50 && len <= 60) || (hasKw && len >= 40 && len <= 70)) return 18;
  if (len >= 30 && len <= 80) return 10;
  return 0;
}

function metaPoints(meta: string, kw: string): number {
  const len = meta.trim().length;
  if (!len) return 0;
  const hasKw = meta.toLowerCase().includes(kw.toLowerCase());
  if (len >= 150 && len <= 160 && hasKw) return 15;
  if ((len >= 150 && len <= 160) || (hasKw && len >= 120 && len <= 180)) return 10;
  if (len >= 80 && len <= 200) return 5;
  return 0;
}

function h1Points(h1: string[], kw: string): number {
  if (h1.length === 0) return 0;
  if (h1.length > 1) return 0;
  const hasKw = h1[0].toLowerCase().includes(kw.toLowerCase());
  return hasKw ? 20 : 12;
}

function hierarchyPoints(h2: string[], h3: string[]): number {
  if (h2.length === 0) return 0;
  // simple skip check: if h3 present but h2 empty → skip
  // we don't have full heading order here; assume order correct if h2 ≥ 2
  if (h2.length >= 2) return 15;
  return 8;
}

function internalLinkPoints(count: number): number {
  if (count >= 3) return 15;
  if (count >= 1) return 8;
  return 0;
}

function urlPoints(url: string): number {
  const path = new URL(url).pathname;
  const depth = path.split('/').filter(Boolean).length;
  const usesHyphens = !path.includes('_');
  const cleanExt = !/\.(php|html?|aspx?)$/.test(path);
  if (depth <= 3 && usesHyphens && cleanExt) return 10;
  if (depth <= 5 && usesHyphens) return 5;
  return 0;
}
```

### 9.3 Content Score

```ts
function contentScore(f: ContentFacts, llmEeatScore: number): number {
  const wc = 25 * Math.min(1, f.wordCount / 1000);

  const kp =
    f.keywordInFirst100 ? 10 :
    f.keywordInFirst200 ? 5 : 0;

  const dup =
    f.maxJaccard < 0.2 ? 10 :
    f.maxJaccard < 0.4 ? 6 :
    f.maxJaccard < 0.6 ? 2 : 0;

  const fresh =
    f.copyrightYear >= (new Date().getFullYear() - 1) ? 10 :
    f.copyrightYear >= (new Date().getFullYear() - 2) ? 6 :
    f.copyrightYear >= (new Date().getFullYear() - 3) ? 3 : 0;

  const gapsCount = f.contentGaps.length;
  const complete =
    gapsCount === 0 ? 15 :
    gapsCount === 1 ? 12 :
    gapsCount === 2 ? 9 :
    gapsCount === 3 ? 6 :
    gapsCount === 4 ? 3 : 0;

  return clamp(wc + kp + dup + fresh + complete + clamp(llmEeatScore, 0, 30), 0, 100);
}
```

### 9.4 Performance Score (CWV)

**LCP sub-score (LCP in seconds):**

```
LCP ≤ 2.5   → 100
LCP ≤ 4.0   → 100 − (LCP − 2.5) / 1.5 × 50
LCP > 4.0   → max(0, 50 − (LCP − 4.0) × 20)
```

**INP sub-score (INP in ms):**

```
INP ≤ 200   → 100
INP ≤ 500   → 100 − (INP − 200) / 300 × 50
INP > 500   → max(0, 50 − (INP − 500) / 100 × 20)
```

**CLS sub-score:**

```
CLS ≤ 0.10  → 100
CLS ≤ 0.25  → 100 − (CLS − 0.10) / 0.15 × 50
CLS > 0.25  → max(0, 50 − (CLS − 0.25) × 100)
```

**Total:**

```ts
function performanceScore(lcp: number, inp: number, cls: number): number {
  return clamp(
    0.40 * lcpScore(lcp) + 0.30 * inpScore(inp) + 0.30 * clsScore(cls),
    0, 100
  );
}
```

### 9.5 Off-Page Score

```ts
function offPageScore(openPageRank: number): number {
  return clamp(openPageRank * 10, 0, 100);
}
```

### 9.6 AI Readiness Score

```ts
function aiReadinessScore(f: AiFacts): number {
  let score = 0;
  if (f.hasJsonLd && f.schemaValid) score += 30;
  if (f.hasLlmsTxt) score += 25;
  if (f.blockedBots.length === 0) score += 25;
  if (f.richResultTypes.length > 0) score += 20;
  return clamp(score, 0, 100);
}
```

### 9.7 Overall Score (Weighted Sum)

```ts
const WEIGHTS = {
  technical:     0.20,
  onpage:        0.20,
  content:       0.20,
  performance:   0.15,
  offpage:       0.10,
  ai_readiness:  0.15,
};
// Sum = 1.00

function overallScore(scores: Record<keyof typeof WEIGHTS, number>): number {
  let sum = 0;
  for (const [k, w] of Object.entries(WEIGHTS)) {
    sum += scores[k as keyof typeof WEIGHTS] * w;
  }
  return Math.round(clamp(sum, 0, 100));
}
```

### 9.8 Grade

```ts
function grade(score: number): 'A+' | 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 90) return 'A+';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 60) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}
```

### 9.9 clamp

```ts
function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
```

---

## 10. API Contract (Fastify)

### `GET /health`
```json
{ "ok": true, "timestamp": "2026-..." }
```

### `POST /audit`
Request:
```json
{ "url": "https://example.com" }
```
Response (immediate):
```json
{ "auditId": "uuid", "status": "running" }
```
Internally: insert row, `setImmediate(() => pipeline(auditId))`, return immediately.

### `GET /audit/:id`
Response (polled every 2s by frontend):
```json
{
  "id": "uuid",
  "status": "running" | "completed" | "failed",
  "currentStep": "crawl_target" | "niche" | ... | "pdf" | null,
  "result": null | FinalReport,
  "error": null | "string"
}
```

**Polling interval:** 2000ms. Stop when status !== 'running'.

---

## 11. Frontend Pages

### `/` — Landing
- Heading: **"Instant AI Website Audit"**
- Subheading: "6-category audit + competitor comparison in 2 minutes"
- URL input + "Run Audit" button
- On submit: `POST /audit` → `router.push('/audit/' + id)`

### `/audit/[id]` — Progress + Report

**While status === 'running':**
- `ProgressSteps` showing 5 high-level steps:
  1. Analyzing website
  2. Finding competitors
  3. Deep crawling
  4. Running 6-category audit
  5. Generating report
- Current step highlighted; completed steps with checkmarks
- Estimated time remaining: `~120s − elapsed`

**When status === 'completed' — sections in order:**

1. **Header:** URL + audit date
2. **ScoreGauge** — big circular gauge 0-100, color by score:
   - ≥80 → green
   - 60-79 → amber
   - <60 → red
   - Grade badge (A+/A/B/C/D/F) below
3. **Category Breakdown** — 6 horizontal bars (each 0-100), color-coded, clickable to scroll to section
4. **Executive Summary** — from synthesizer
5. **Top 3 Priorities** — cards with category tag
6. **Technical Section** — score + findings + evidence (robots.txt preview if fails)
7. **On-Page Section** — score + findings + evidence (title, meta, H1 preview in monospace)
8. **Content Section** — score + findings + content gaps table
9. **Performance Section** — score + 3 CWV mini-gauges (LCP, INP, CLS) + findings
10. **Off-Page Section** — score + DA + competitor DA comparison + findings
11. **AI Readiness Section** — score + checklist (JSON-LD ✓/✗, llms.txt ✓/✗, AI crawlers ✓/✗, rich results ✓/✗) + findings
12. **Screenshot Comparison** — target vs competitor mobile screenshots (from Vision)
13. **Download PDF button** — links to `result.pdf_url`

**When status === 'failed':**
- Error card with `error_message`
- "Try Again" button → `POST /audit` again

### `/audit/[id]/print` — Print-friendly
- Same content, single-column layout, `@media print` CSS
- No polling, no nav
- Backend Playwright navigates here for PDF

**Design:** Tailwind + shadcn/ui. Accent = indigo-600. Card-based, generous spacing, mobile-responsive.

---

## 12. Environment Variables (`.env.example`)

```bash
# Backend (apps/api)
PORT=4000
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxx
SUPABASE_ANON_KEY=xxx
GEMINI_API_KEY=xxx
SERPER_API_KEY=xxx
OPENPAGERANK_API_KEY=xxx
WEB_BASE_URL=http://localhost:3000

# Frontend (apps/web)
NEXT_PUBLIC_API_BASE_URL=http://localhost:4000
```

**Never commit `.env`.**

---

## 13. Implementation Phases (strict order)

### **Phase 1 — Foundation** (2-3h)
- pnpm workspace, root package.json, tsconfig, .gitignore, .env.example
- `apps/api`: Fastify + TS, `GET /health`
- `apps/web`: Next.js bare page
- Supabase project + `audits` table + 2 buckets (`screenshots`, `reports`)
- **Deliverable:** `pnpm dev` → :4000 health OK, :3000 blank OK

### **Phase 2 — Crawler** (4-6h — biggest)
- Playwright install + chromium
- `crawler/playwright.ts::crawlUrl(url)` returns full `CrawlData`
- Screenshot upload to Supabase Storage
- `crawler/broken-links.ts::checkBrokenLinks(urls, limit=10)` with `p-limit(5)`
- Test script: `pnpm tsx src/scripts/test-crawl.ts https://example.com` → prints JSON + URLs
- **Deliverable:** terminal-এ full CrawlData JSON

### **Phase 3 — Technical + AI Readiness** (3-4h — both code)
- `analysts/technical.ts` — all 8 checks
- `analysts/ai-readiness.ts` — all 4 checks (fetch `/llms.txt` inside)
- Test script prints both analyses
- **Deliverable:** terminal-এ two CategoryAnalysis JSONs

### **Phase 4 — Niche + Competitor** (2-3h)
- `lib/gemini.ts::generateJson(prompt, schema)` with retry
- `analysts/niche.ts`
- `lib/serper.ts` + `analysts/competitor.ts`
- **Deliverable:** URL → niche JSON → 2 competitor URLs

### **Phase 5 — On-Page + API wiring** (3-4h)
- `analysts/on-page.ts` (pure code)
- `routes/audit.ts` — `POST /audit`, `GET /audit/:id`
- `pipeline.ts` — runs Crawl → [Tech, AI, Niche] parallel → Competitor, saves each step to DB, updates `current_step`
- **Deliverable:** POST → poll → DB filled with tech/ai/niche/onpage/competitors

### **Phase 6 — Lighthouse** (2-3h)
- `crawler/lighthouse.ts::runLighthouse(url)` — chrome-launcher + lighthouse, timeout 60s
- `analysts/performance.ts`
- Wire into pipeline Parallel B
- **Deliverable:** performance_analysis populated with LCP/INP/CLS

### **Phase 7 — Competitor crawl + Content + Off-Page** (3-4h)
- Pipeline: after competitor hunter, crawl competitors in parallel
- `analysts/content.ts` — code sub-scores + 1 LLM call
- `lib/openpagerank.ts` + `analysts/off-page.ts`
- **Deliverable:** all 6 analyses except Vision populated

### **Phase 8 — Vision** (2-3h — risky, last of analysts)
- Resize screenshots to max 1024px width before base64
- `analysts/vision.ts` — 1 LLM call with images
- Wire into pipeline
- **Deliverable:** uiux/vision findings present

### **Phase 9 — Synthesizer + Scoring** (2h)
- `lib/scoring.ts` — all §9 formulas
- `analysts/synthesizer.ts` — 1 LLM call for summary + priorities (NOT scores)
- Pipeline F: compute scores → LLM summary → save `final_report`, `status='completed'`
- **Deliverable:** full FinalReport JSON in DB

### **Phase 10 — Report UI** (5-6h)
- `/audit/[id]` page with polling
- All components: ScoreGauge, CategoryScore, FindingCard, CwvGauges, ScreenshotCompare, EvidenceBlock, PrioritiesList, ProgressSteps
- `/audit/[id]/print` page
- **Deliverable:** full report visible in browser

### **Phase 11 — PDF** (2h)
- Pipeline G: Playwright opens `${WEB_BASE_URL}/audit/{id}/print`, `page.pdf({ format: 'A4', printBackground: true })`, upload, save `pdf_url`
- Download button on report page
- **Deliverable:** PDF download works end-to-end

### **Phase 12 — Polish** (2-3h)
- Error states (failed status + retry)
- Loading skeletons
- Empty states
- Landing page polish
- Demo rehearsal (run 2 audits, time them)

**Commit at the end of each phase. Report back to user before starting next phase.**

---

## 14. Coding Standards

- TypeScript `strict: true`
- Every external input validated by Zod
- Every external API call: try/catch + retry (3x exponential: 1s, 2s, 4s) + typed error
- No `any` — use `unknown` + Zod parse
- File naming: kebab-case
- Small functions, single responsibility
- Comments only where logic is non-obvious
- `pnpm lint` and `pnpm typecheck` must pass before commit
- Pipeline must `try/finally` update DB status — never leave a row stuck in `running`

---

## 15. Cost & Time Guardrails

- **LLM calls per audit:** exactly 4 (Niche, Content, Vision, Synthesizer)
- **Body text limit in prompts:** target 2000 words, competitors 800 words each
- **Screenshot resize:** max 1024px width before Vision
- **Serper calls:** exactly 3 (one per keyword)
- **Lighthouse:** target only (mobile), timeout 60s
- **Broken link checks:** max 10 internal links, concurrency 5
- **Playwright page timeout:** 30s per page, 1 retry
- **Overall audit timeout:** 180s hard kill → `status='failed'`
- **Playwright browser instances:** max 3 concurrent (target + 2 competitors)

---

## 16. Anti-Patterns (DO NOT DO)

- ❌ Queue (BullMQ/Redis)
- ❌ WebSocket/SSE
- ❌ Full-page screenshots
- ❌ LLM computing final scores
- ❌ >2 competitors
- ❌ Multi-page crawl
- ❌ MongoDB or any non-Supabase DB
- ❌ React-PDF (use Playwright `page.pdf()`)
- ❌ Lighthouse on competitors (target only)
- ❌ RAG / vector DB (system prompt is enough)
- ❌ Dynamic skill loading (`SKILL.md`) — hardcode checklists in code
- ❌ Adding features not in this spec

---

## 17. Success Criteria (Demo Pass)

Demo URL-এ (e.g., একটা local agency site):
1. ✅ Report loaded in ≤ 150s
2. ✅ Overall score + grade visible
3. ✅ All 6 category scores present
4. ✅ At least 1 finding per category
5. ✅ CWV gauges show real numbers
6. ✅ Screenshot comparison visible
7. ✅ PDF downloads and opens
8. ✅ No console errors
9. ✅ UI looks polished (shadcn)

---

## 18. When Stuck — Agent Instructions

1. **Spec unclear?** → Ask user, do not guess.
2. **Library version conflict?** → Let pnpm resolve; don't force.
3. **Playwright browser missing?** → `pnpm exec playwright install chromium`
4. **Gemini 429 rate-limit?** → 3 retries with exponential backoff (1s, 2s, 4s), then fail that step gracefully.
5. **Supabase connection fail?** → Check env vars, verify project active in dashboard.
6. **Screenshot upload fail?** → Verify bucket name and service-role key.
7. **Lighthouse chrome fails?** → `pnpm exec playwright install chromium` also provides chromium binary; ensure `CHROME_PATH` set if needed.
8. **OpenPageRank 401?** → Verify API key; if unavailable, set offpage score to 40 and add finding.
9. **Serper 401/quota?** → Stop competitor step, set `competitors=[]`, continue with target-only analyses.
10. **Full pipeline stuck?** → Check `current_step` in DB; log all step transitions.

---

## 19. Build Commands (root package.json)

```json
{
  "scripts": {
    "dev": "pnpm -r --parallel dev",
    "dev:api": "pnpm --filter api dev",
    "dev:web": "pnpm --filter web dev",
    "typecheck": "pnpm -r typecheck",
    "lint": "pnpm -r lint",
    "build": "pnpm -r build"
  }
}
```

---

**END OF SPEC (v2 — Full 6-Category)**

Agent: এই ফাইল সম্পূর্ণ পড়া শেষ হলে user-কে 5-line summary দেবে এবং নিশ্চিত করবে Phase 1 শুরু করার অনুমতি আছে কি না। প্রতিটা phase শেষে user-কে report দেবে এবং পরের phase-এর go-ahead নেবে।