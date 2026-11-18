---
title: Rostify
emoji: 🔍
colorFrom: indigo
colorTo: purple
sdk: docker
app_port: 7860
pinned: false
license: mit
short_description: AI website audit in two minutes
---

# Rostify

Paste a URL and get a full website audit — technical SEO, performance, content,
AI-readiness, competitors and screenshot-based mobile UX — with prioritised
fixes in a shareable report and a downloadable PDF.

This Space runs the entire product in one container:

| Path     | Service                              |
| -------- | ------------------------------------ |
| `/`      | Next.js web app                      |
| `/svc/*` | Fastify audit API (Chromium, PDF)    |
| `/api/*` | PocketBase (data, screenshots, PDFs) |
| `/_/*`   | PocketBase admin UI                  |

Source code: <https://github.com/cartory7107/roastifyrs>

## Required secrets

Add these in **Settings → Variables and secrets** (secrets, not variables):

| Secret                     | Purpose                                    |
| -------------------------- | ------------------------------------------ |
| `POCKETBASE_ADMIN_EMAIL`   | PocketBase superuser (e.g. admin@local.test) |
| `POCKETBASE_ADMIN_PASSWORD`| Any strong password                        |
| `GEMINI_API_KEY`           | AI scoring explanations (free tier)        |
| `SERPER_API_KEY`           | competitor discovery, keyword demand       |

Optional: `OLLAMA_API_KEY`, `GROQ_API_KEY`, `OPENPAGERANK_API_KEY`,
`SEODATA_API_KEY`. Missing keys make the audit skip that stage instead of
failing.

## Notes

- Free CPU hardware has no persistent disk: audit history resets when the Space
  restarts or rebuilds. New audits always work.
- Free Spaces sleep after a period of inactivity; the first visit wakes them in
  roughly 30–60 seconds.
- Rebuild the Space (Settings → Factory reboot) after pushing to `main` to pull
  the latest code.
