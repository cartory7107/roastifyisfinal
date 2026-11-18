# Deploying Rostify

> **PC ছাড়া পুরো প্রোডাক্ট চালাতে চাইলে:** [`deploy/README.md`](deploy/README.md)
> ফলো করো — একটাই ফ্রি VM-এ web + API + PocketBase + Cloudflare Tunnel, আর
> `main`-এ push করলেই GitHub Actions অটো ডিপ্লয় করে। নিচের অংশটা হাতে
> (manual) ডিপ্লয়ের রেফারেন্স, একই স্ট্যাকের ভ্যারিয়েবলগুলো এখানে বিস্তারিত।

Three processes, one host:

| Service | Image | Why it needs what it needs |
| --- | --- | --- |
| `web` | `frontend/Dockerfile` (Next.js 14, standalone) | Tiny; talks to the API from the **browser** |
| `api` | `backend/Dockerfile` (Playwright base) | Runs Chromium for screenshots, Lighthouse and the report PDF |
| `pocketbase` | `ghcr.io/muchobien/pocketbase` | Stores audits + screenshots/PDFs on a persistent volume |

`api` renders the PDF by loading `WEB_BASE_URL/audit/:id/print`, so the two
containers must be on the same network (`docker-compose.yml` handles that).

**Host size:** 2 vCPU / 4 GB RAM minimum. An audit peaks around 600 MB
(Chromium + Lighthouse) and a full run takes ~2–3 minutes.

## 1. Configure

```bash
git clone <repo> rostify && cd rostify
cp .env.example .env
```

Fill these in `.env` — the first five are mandatory in production, the API
refuses to boot without PocketBase:

| Key | Value |
| --- | --- |
| `POCKETBASE_ADMIN_EMAIL` / `POCKETBASE_ADMIN_PASSWORD` | the PocketBase superuser you create in step 3 |
| `LLM_PROVIDER` | `auto` (Gemini free first, then Ollama, then Groq), `gemini`, `ollama`, or `groq` |
| `GEMINI_API_KEY` | AI analysis, niche, content + vision review (free: https://aistudio.google.com/apikey) |
| `OLLAMA_API_KEY` | AI analysis, niche, content + vision review (https://ollama.com/settings/keys) |
| `GROQ_API_KEY` | fallback provider for the same analyses (free tier) |
| `SERPER_API_KEY` | competitor discovery, search intent |
| `CORS_ORIGINS` | `https://your-domain` (comma-separated if several) |
| `POCKETBASE_PUBLIC_URL` | `https://pb.your-domain` — **browser-facing**, used for screenshots/PDF links |
| `NEXT_PUBLIC_API_BASE_URL` | `https://api.your-domain` — **browser-facing**, baked into the JS bundle |
| `NEXT_PUBLIC_API_BASE_URL` in `frontend` build args | same value; changing it needs an image rebuild |

Do **not** set `ALLOW_PRIVATE_HOSTS` in production (it would allow auditing
`localhost`/private IPs — an SSRF hole). `TRUST_PROXY=true` is already set by
compose.

## 2. Start PocketBase and create the superuser

```bash
docker compose up -d pocketbase
# open http://SERVER_IP:8090/_/  ->  create the first superuser
# use exactly the email/password you put in .env
```

## 3. Start the stack

```bash
docker compose up -d --build
docker compose ps            # all three healthy
```

Create the `audits` collection (idempotent; also raises the `payload` JSON cap
to 10 MB on an existing install, which a large competitor sitemap needs):

```bash
docker compose exec api pnpm --filter backend setup:pb
```

## 4. Put TLS in front

Expose only `web` (3000), `api` (4000) and `pocketbase` (8090) through a
reverse proxy. Caddy example:

```caddy
rostify.example.com      { reverse_proxy 127.0.0.1:3000 }
api.rostify.example.com  { reverse_proxy 127.0.0.1:4000 }
pb.rostify.example.com   { reverse_proxy 127.0.0.1:8090 }
```

The API's `POST /audit/:id/pdf` can take up to a minute on a cold render, so a
proxy read timeout above 300 s is safest (nginx: `proxy_read_timeout 300s;`).

## 5. Verify

```bash
curl -fsS https://api.your-domain/health
curl -fsS https://api.your-domain/health/ready
curl -fsS -o /dev/null -w '%{http_code}\n' https://your-domain/
```

Then in a browser: run one audit end to end, open the report, confirm the
screenshots render (they come from `POCKETBASE_PUBLIC_URL`) and that
**Download PDF** returns a PDF.

## Operational notes

- **Build-time URL:** `NEXT_PUBLIC_API_BASE_URL` is compiled into the browser
  bundle. Changing it requires `docker compose build web`.
- **Concurrency:** audits run in-process; keep one API replica and tune
  `MAX_CONCURRENT_AUDITS` (default 2) to the host's RAM. Horizontal scaling
  would need a shared job queue first.
- **Data:** everything lives in the `pb_data` volume — back that up, not the
  containers. `docker compose down` keeps it; `down -v` deletes it.
- **Secrets:** `.env` is git-ignored. Never bake keys into an image.
- **Playwright version:** `backend/Dockerfile` pins the base image to the
  `playwright` version in `pnpm-lock.yaml`. Bumping Playwright means bumping
  that tag too, or Chromium will not match the client library.

## Alternative split (web on Vercel)

Possible but more moving parts: deploy `frontend` to Vercel with
`NEXT_PUBLIC_API_BASE_URL` pointing at the API host, keep `api` + `pocketbase`
on a Docker host, and add the Vercel domain to `CORS_ORIGINS`. The API still
needs its own Chromium-capable container, so a serverless function won't work.
