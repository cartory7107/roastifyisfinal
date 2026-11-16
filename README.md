# Rostify

AI-powered SEO audit engine. Submit a URL and Rostify crawls the page, scores it across
six categories (technical, on-page, content, performance, off-page, AI readiness), reviews
the rendered screenshots, compares you against the live SERP, and produces a ranked report
plus a PDF.

## Stack

| Layer      | Choice                                                              |
| ---------- | ------------------------------------------------------------------- |
| Frontend   | Next.js 14 (App Router), Tailwind CSS, Radix UI                     |
| Backend    | Fastify 4 + TypeScript (ESM), Zod-validated config                  |
| Database   | PocketBase 0.40 (SQLite + file storage, single binary)              |
| Crawling   | Playwright (Chromium) + Lighthouse                                  |
| Analysis   | Gemini via `@google/genai`; Serper for SERP; Open PageRank for DA    |
| Monorepo   | pnpm workspaces (`frontend`, `backend`, `packages/shared`)          |

## Repository layout

```
backend/            Fastify API, crawl pipeline, analysts, PocketBase client
  src/index.ts      Server bootstrap: helmet, CORS allowlist, rate limit, health
  src/pipeline.ts   13-stage audit runner with a concurrency cap
  src/lib/store.ts  PocketBase persistence (payload merge + per-audit write queue)
  src/lib/pb.ts     PocketBase auth, file uploads, public file URLs
frontend/           Next.js app (submit URL, poll status, render report)
packages/shared/    Types + Zod schemas shared by both apps
```

## Prerequisites

- Node.js **>= 20.19**
- pnpm **9** (`corepack enable` is enough)
- PocketBase **0.40+**
- Chromium for Playwright, and Chrome installed for Lighthouse

## Setup

```bash
pnpm install
pnpm exec playwright install chromium
```

### 1. Run PocketBase

Download the binary for your platform from <https://pocketbase.io/docs/> and put it in
`pb/` (gitignored):

```bash
./pb/pocketbase serve --http=127.0.0.1:8090
```

Create the superuser the API authenticates as (one time):

```bash
./pb/pocketbase superuser upsert admin@rostify.local "change-me"
```

### 2. Configure the backend

```bash
cp .env.example backend/.env
```

Set `POCKETBASE_ADMIN_PASSWORD` to the password you chose above. The optional
`GEMINI_API_KEY`, `SERPER_API_KEY` and `OPENPAGERANK_API_KEY` unlock the corresponding
analyses — without them those stages degrade instead of failing.

### 3. Create the `audits` collection

```bash
pnpm --filter backend setup:pb
```

The script is idempotent: it logs in as the superuser, checks for `audits`, and creates it
(`target_url`, `status`, `current_step`, `payload` JSON, `pdf_url`, `error_message`,
`completed_at`, `screenshots` files, `report` PDF, plus an index on `status`).

### 4. Run everything

```bash
pnpm dev        # API on :4000, web on :3000
```

## Environment variables

| Variable                   | Required | Default                 | Notes                                                        |
| -------------------------- | -------- | ----------------------- | ------------------------------------------------------------ |
| `PORT`                     | no       | `4000`                  | API port                                                     |
| `HOST`                     | no       | `0.0.0.0`               | API bind address                                             |
| `NODE_ENV`                 | no       | `development`           | `production` makes missing PocketBase config fatal           |
| `POCKETBASE_URL`           | yes      | –                       | e.g. `http://127.0.0.1:8090`                                 |
| `POCKETBASE_PUBLIC_URL`    | no       | `POCKETBASE_URL`        | Browser-facing URL for screenshot/PDF links                  |
| `POCKETBASE_ADMIN_EMAIL`   | yes      | –                       | Superuser email                                              |
| `POCKETBASE_ADMIN_PASSWORD`| yes      | –                       | Superuser password                                           |
| `WEB_BASE_URL`             | no       | –                       | Used for PDF rendering and as the default CORS origin        |
| `CORS_ORIGINS`             | no       | `WEB_BASE_URL`          | Comma-separated allowlist, overrides `WEB_BASE_URL`          |
| `GEMINI_API_KEY`           | no       | –                       | Enables LLM analyses                                         |
| `SERPER_API_KEY`           | no       | –                       | Enables competitor/SERP analysis                             |
| `OPENPAGERANK_API_KEY`     | no       | –                       | Enables Domain Authority lookups                             |
| `TRUST_PROXY`              | no       | `false`                 | `true` behind a reverse proxy / PaaS load balancer           |
| `ALLOW_PRIVATE_HOSTS`      | no       | `false`                 | Allow auditing localhost / private IPs (local dev only)       |
| `MAX_CONCURRENT_AUDITS`    | no       | `2`                     | Global audit concurrency cap (1–50)                          |
| `RATE_LIMIT_MAX`           | no       | `5`                     | `POST /audit` requests per window                            |
| `RATE_LIMIT_WINDOW`        | no       | `1 minute`              | Rate-limit window                                            |
| `BODY_LIMIT_BYTES`         | no       | `1048576`               | Maximum request body                                         |
| `NEXT_PUBLIC_API_BASE_URL` | no       | `http://localhost:4000` | Frontend → API base URL                                      |

## Scripts

| Command                            | What it does                                          |
| ---------------------------------- | ----------------------------------------------------- |
| `pnpm dev`                         | Run API + web in parallel                             |
| `pnpm dev:api` / `pnpm dev:web`    | Run one side                                          |
| `pnpm typecheck`                   | `tsc --noEmit` in every package                       |
| `pnpm lint`                        | ESLint (backend) + `next lint` (frontend)             |
| `pnpm test`                        | Vitest across `backend` and `packages/shared`         |
| `pnpm build`                       | Compile the API, build the Next.js app                |
| `pnpm --filter backend setup:pb`   | Create the `audits` collection                        |
| `pnpm --filter backend test:audit` | Run a full audit against `POCKETBASE_URL`             |

## API

| Route             | Description                                                                 |
| ----------------- | --------------------------------------------------------------------------- |
| `POST /audit`     | `{ "url": "https://example.com" }` → `{ auditId, status }` (rate limited)   |
| `GET /audit/:id`  | Poll status, current step, page snapshot, analyses, final report, PDF URL   |
| `GET /health`     | Liveness                                                                    |
| `GET /health/ready` | Readiness: 503 unless PocketBase answers                                  |

`GET /audit/:id` is public because it powers the shared report page; writes go through
the admin-only PocketBase credentials held by the API.

Every error uses one shape, `{ "error": string, "requestId": string }`. Unexpected failures
are logged with that request id and answered as `500 Internal server error.`, so internal
details never leak. Deliberate 4xx messages (validation, blocked URL, rate limit) pass through.

### URL safety

`POST /audit` fetches the submitted URL with a real browser, so the server would otherwise be
an SSRF proxy into its own network. The API resolves the host and rejects loopback, RFC 1918,
link-local (cloud metadata), CGNAT, multicast, unique-local and NAT64 addresses, plus hostnames
like `localhost` and URLs with embedded credentials. `ALLOW_PRIVATE_HOSTS=true` is a local-dev
escape hatch for auditing `localhost`; leave it off in production. The check is best-effort:
the resolved address is not pinned into Playwright, so DNS rebinding can still slip through.
Run the API with no access to cloud metadata endpoints as defence in depth.

## How an audit runs

`crawl_target → niche → technical → ai_readiness → performance → competitor →
crawl_competitors → onpage → content → offpage → vision → synthesize → pdf`

Independent stages run in parallel. Progress is persisted on every step, so a crash leaves
the row inspectable instead of silent. Payload writes are serialised per audit id, which
prevents parallel stages from overwriting each other's keys.

On boot the API marks any audit left in `pending`/`running` as `failed` with
`"Interrupted by a server restart"`. The in-process pipeline did not survive the restart, so
the client would otherwise poll a status that can never change.

## Testing

- `backend/src/lib/store.test.ts` — payload split, merge, the write queue that prevents
  lost updates under concurrent stages, and boot-time recovery of interrupted audits.
- `backend/src/lib/url-guard.test.ts` — SSRF guard: private/loopback/link-local IPv4 and IPv6,
  NAT64, credentials, mixed DNS answers, and the local-dev escape hatch.
- `backend/src/lib/errors.test.ts` — shared error shape, 500 masking, 4xx passthrough.
- `backend/src/index.test.ts` — `buildServer` wiring: health routes and the 404/error handlers.
- `backend/src/routes/audit.test.ts` — validation, blocked URLs, 503 without PocketBase, poll responses.
- `backend/src/routes/health.test.ts` — liveness/readiness including the PocketBase probe.
- `packages/shared/src/schemas.test.ts` — shared schemas (PocketBase id format, poll payload).

CI (`.github/workflows/ci.yml`) runs install → typecheck → lint → test → build on Node 22.

## Deploying

- Run **one** API instance: concurrency limits and the write queue are in-process.
- Persist `pb_data/` (the whole PocketBase state: SQLite + uploaded files). That directory
  is the backup unit.
- Build with `pnpm build`; start the API with `node backend/dist/index.js` and the web app
  with `pnpm --filter frontend start`.
- Set `NODE_ENV=production`, `TRUST_PROXY=true` behind a proxy, and an explicit
  `CORS_ORIGINS`.
- Keep `ALLOW_PRIVATE_HOSTS` unset so submitted URLs cannot reach your private network.
- Point your health check at `/health/ready` so a broken database fails the deploy.

## License

MIT — see [LICENSE](./LICENSE).
