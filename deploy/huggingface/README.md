# Hugging Face Space-এ পুরো প্রোডাক্ট (PC ছাড়া)

এই গাইডে পুরো প্রোডাক্ট — **web + API + PocketBase** — একটা Hugging Face Space-এ চলবে। তোমার PC বন্ধ থাকলেও সাইট ও অডিট টুল কাজ করবে।

```
https://<username>-rostify.hf.space
        │
        ▼
┌──────────────────────────────────────────────┐
│  একটাই কনটেইনার (পোর্ট 7860)                 │
│   /       → Next.js web                      │
│   /svc/*  → Fastify API (Chromium+Lighthouse)│
│   /api/*  → PocketBase (ডেটা/স্ক্রিনশট/PDF)  │
│   /_/*    → PocketBase admin                 │
└──────────────────────────────────────────────┘
```

> ⚠️ **জরুরি:** Hugging Face-এর নিয়ম অনুযায়ী Docker Space তৈরি করতে **PRO প্ল্যান ($9/মাস)** লাগতে পারে। ফ্রি অ্যাকাউন্টে "Create Space → Docker" ব্লক করলে জানাও — তখন অন্য ফ্রি পথ (Northflank / serverless) দেখাব। এই গাইডের বাকি সব ধাপ একই থাকবে।

---

## যা লাগবে

- Hugging Face অ্যাকাউন্ট (ফ্রি) — https://huggingface.co/join
- এই ৪টা ফাইল (রিপোতে আছে): `Dockerfile`, `start.sh`, `nginx.conf`, `SPACE_README.md`
- তোমার API কী-গুলো (Gemini, Serper — লোকাল `backend/.env` থেকে)

---

## ধাপ ১ — Space তৈরি

1. https://huggingface.co/new-space
2. **Space name:** `rostify`
3. **License:** MIT
4. **SDK:** **Docker** → **Blank**
5. **Hardware:** **CPU basic · 2 vCPU · 16 GB · FREE**
6. **Visibility:** **Public** (ফ্রি হার্ডওয়্যারে পাবলিক লাগে)
7. **Create Space**

তোমার URL হবে: `https://<username>-rostify.hf.space`

## ধাপ ২ — ফাইল আপলোড

Space → **Files** ট্যাব → **Add file → Upload files**:

| লোকাল ফাইল | Space-এ নাম |
| --- | --- |
| `deploy/huggingface/Dockerfile` | `Dockerfile` |
| `deploy/huggingface/start.sh` | `start.sh` |
| `deploy/huggingface/nginx.conf` | `nginx.conf` |
| `deploy/huggingface/SPACE_README.md` | `README.md` (আগেরটা replace করো) |

> `README.md`-এর উপরের `---` ব্লকটা (title, sdk: docker, app_port: 7860) **মুছবে না** — HF এই মেটাডেটা থেকেই বোঝে কীভাবে চালাতে হবে।

**Git দিয়ে করতে চাইলে** (ঐচ্ছিক):

```bash
# HF token: Settings → Access Tokens → New token (Write)
cd deploy/huggingface
git init -b main
cp SPACE_README.md README.md
git add . && git commit -m "Rostify Space"
git remote add hf https://huggingface.co/spaces/<username>/rostify
git push hf main
```

## ধাপ ৩ — Secrets বসাও

Space → **Settings → Variables and secrets → New secret**:

| Name | Value |
| --- | --- |
| `POCKETBASE_ADMIN_EMAIL` | `admin@rostify.local` |
| `POCKETBASE_ADMIN_PASSWORD` | একটা শক্ত পাসওয়ার্ড (নিজে মনে রাখো) |
| `GEMINI_API_KEY` | তোমার ফ্রি Gemini কী |
| `SERPER_API_KEY` | সার্চ/কম্পিটিটর কী |

ঐচ্ছিক: `OLLAMA_API_KEY`, `GROQ_API_KEY`, `OPENPAGERANK_API_KEY`, `SEODATA_API_KEY`।

> কী না থাকলে অডিট ফেল করবে না — শুধু ওই ধাপটা বাদ যাবে।

## ধাপ ৪ — Build দেখো

Space → **Logs** ট্যাব। প্রথম build **১০–২০ মিনিট** (Playwright ইমেজ + Next.js build)।

সফল হলে লগে দেখবে:

```
[rostify] public url: https://<username>-rostify.hf.space
[rostify] ...
```

## ধাপ ৫ — টেস্ট

1. `https://<username>-rostify.hf.space` খোলো
2. একটা URL দিয়ে অডিট চালাও (~২ মিনিট)
3. স্কোর + স্ক্রিনশট + PDF দেখা যাচ্ছে কি না দেখো
4. অ্যাডমিন প্যানেল: `https://<username>-rostify.hf.space/_/`

API হেলথ: `https://<username>-rostify.hf.space/svc/health`

## ধাপ ৬ — কোড আপডেট করলে

Space ইমেজ build করার সময় GitHub-এর `main` থেকে কোড ক্লোন করে। তাই:

```bash
# তোমার PC-তে
git push origin main
```

তারপর Space → **Settings → Factory reboot** (অথবা **Restart**)
→ নতুন করে build হবে, নতুন কোড চালু হবে।

> চাইলে `Dockerfile`-এর `ARG REPO_REF=main` বদলে নির্দিষ্ট কমিট/ট্যাগ পিন করতে পারো।

---

## Vercel-ও ব্যবহার করতে চাইলে (ঐচ্ছিক)

HF একাই পুরো সাইট সার্ভ করে, তাই Vercel দরকার নেই। তবু Vercel-এর ফ্রন্টএন্ড রাখতে চাইলে:

1. Vercel → Project → **Settings → Environment Variables**
2. `NEXT_PUBLIC_API_BASE_URL` = `https://<username>-rostify.hf.space/svc`
3. **Redeploy** (build-time variable, redeploy ছাড়া কাজ করবে না)
4. Space-এ একটা variable যোগ করো:
   `CORS_ORIGINS` = `https://<username>-rostify.hf.space,https://roastifyrs.vercel.app,https://*.vercel.app`

---

## সীমাবদ্ধতা (সৎভাবে)

| বিষয় | অবস্থা |
| --- | --- |
| ফ্রি ডিস্ক | **ephemeral** — Space restart/rebuild হলে পুরোনো অডিট রিপোর্ট মুছে যায় (নতুন অডিট সবসময় কাজ করে) |
| Sleep | ৪৮ ঘণ্টা কেউ ব্যবহার না করলে ঘুমায়; প্রথম ভিজিটে ৩০–৬০ সেকেন্ড warm-up |
| ডেটা রাখতে চাইলে | Space Settings → **Persistent storage** (পেইড add-on) |
| পাবলিক | ফ্রি কম্পিউটে Space পাবলিক থাকে — API-ও পাবলিক (এখন যেমন) |
| CPU | 2 vCPU — একটা অডিট ~২–৪ মিনিট, একসাথে ২টা চলতে পারে |

জাজদের সামনে ডেমো করার আগে একবার সাইট খুলে একটা অডিট চালিয়ে warm-up করে রাখো।

---

## সমস্যা হলে

| লক্ষণ | সমাধান |
| --- | --- |
| Build ফেইল: `pnpm install` | Logs-এ আসল এরর দেখো; GitHub `main`-এ lockfile ঠিক আছে কি না |
| Build ফেইল: `git clone` | রিপো পাবলিক কি না; `REPO_REF` = `main` |
| সাইট খুলছে, কিন্তু অডিট ফেইল | Secrets-এ `GEMINI_API_KEY`, `SERPER_API_KEY`, `POCKETBASE_ADMIN_*` আছে কি না |
| স্ক্রিনশট/PDF 404 | `SPACE_HOST` ঠিক আছে কি না; `/api/` রুট nginx-এ ব্লকড কি না |
| PDF তৈরি হয় না | Logs-এ `PDF render failed`; `WEB_BASE_URL` = `http://127.0.0.1:7860` (start.sh নিজেই সেট করে) |
| প্রথম রিকোয়েস্টে ৫০৩ | Space ঘুমিয়ে ছিল — ৩০–৬০ সেকেন্ড পর আবার চেষ্টা করো |
| `PocketBase admin login failed` | Space secret-এ `POCKETBASE_ADMIN_EMAIL/PASSWORD` যোগ করো, তারপর Factory reboot |
| মেমরি শেষ / অডিট ক্র্যাশ | `MAX_CONCURRENT_AUDITS=1` variable যোগ করো |

---

## খরচ

- CPU basic (2 vCPU / 16 GB): **$0** (Docker Space-এর জন্য PRO প্ল্যান লাগতে পারে)
- Persistent storage: পেইড add-on (ঐচ্ছিক)
- ডোমেইন: `*.hf.space` ফ্রি
