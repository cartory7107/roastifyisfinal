# Deploying the web app on Vercel

The repository is a pnpm monorepo. Only `frontend/` is deployed to Vercel; the
audit engine (Fastify + Chromium + Lighthouse + PocketBase) runs on a machine
that can execute a real browser and keep a disk.

```
Browser ─── https://roastifys.cartory.top (Vercel) ───┐
                                                      │  fetch()
                                                      ▼
                         https://roastifys-api.cartory.top (Fastify)
                                                      │
                                                      ▼
                         https://roastifys-pb.cartory.top (PocketBase files)
```

The API and PocketBase are already public through the Cloudflare Tunnel, so the
Vercel deployment works the moment it is created — no environment variables to
configure.

## One-time import (≈ 60 seconds)

1. Open <https://vercel.com/new/import?s=https%3A%2F%2Fgithub.com%2Fcartory7107%2Froastifyrs>
2. Click **Import** next to `cartory7107/roastifyrs`.
3. Set **Root Directory** to `frontend` (click **Edit** → `frontend`).
4. Leave the framework as **Next.js** and every build setting on its default.
5. Click **Deploy**.

That is the whole configuration. `frontend/.env.production` ships
`NEXT_PUBLIC_API_BASE_URL=https://roastifys-api.cartory.top`, and
`frontend/src/lib/api.ts` falls back to the same URL in production even if the
file is not picked up.

`frontend/vercel.json` pins the framework and installs only the workspace
packages the web app needs (`pnpm install --filter frontend...`), so the pnpm
workspace resolves `@rostify/shared` correctly.

## Custom domain

In the Vercel project: **Settings → Domains → Add** `app.cartory.top`. Vercel
shows a CNAME target (`cname.vercel-dns.com`). In Cloudflare DNS add:

| Type  | Name  | Target                 | Proxy    |
| ----- | ----- | ---------------------- | -------- |
| CNAME | `app` | `cname.vercel-dns.com` | DNS only |

The API already accepts `https://*.vercel.app` and `https://app.cartory.top`
through `CORS_ORIGINS`, so browser requests from both the Vercel URL and the
custom domain are allowed.

## Why the API cannot be deployed to Vercel

Every audit runs a real Chromium browser (screenshots, Lighthouse, PDF render)
for 2–5 minutes and stores results plus image/PDF files on a persistent disk.
Vercel Functions are short-lived, have no browser binary and no persistent
filesystem, and Hobby functions are cut off long before an audit finishes. The
engine also cannot be split into serverless pieces without removing the very
features that make the report useful.

The free, always-on option for the engine is an **Oracle Cloud Always Free**
VM (Ampere A1: up to 4 OCPU / 24 GB RAM, no time limit):

1. Create the account at <https://cloud.oracle.com> (card for identity
   verification only; the Always Free resources are not charged).
2. Create an Ubuntu 22.04 Ampere A1 instance and open ports `80`/`443` (or keep
   using the Cloudflare Tunnel, in which case no inbound ports are needed).
3. Run the repository's `docker-compose.yml` (`cp .env.example .env` first) –
   see `DEPLOY.md` for every variable.
4. Point the `roastifys-api` / `roastifys-pb` tunnel hostnames, or their DNS
   records, at the VM.

Nothing in the frontend changes during that migration: the public API URL stays
`https://roastifys-api.cartory.top`.
