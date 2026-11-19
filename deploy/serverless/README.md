# Serverless deploy — Neon + Render + Vercel

**লক্ষ্য:** তোমার PC বন্ধ থাকলেও ওয়েবসাইট ও অডিট টুল চলবে। কোনো কার্ড লাগবে না, কোনো
ট্রায়াল শেষ হবে না।

```
Browser
  │  https://roastifyrs.vercel.app      (Vercel — শুধু ফ্রন্টএন্ড)
  ▼
Fastify API
  │  https://rostify-api.onrender.com   (Render Free — অডিট ইঞ্জিন)
  ├── Neon Postgres   (অডিট ডেটা + স্ক্রিনশট + PDF)
  ├── PageSpeed Insights / mShots (স্ক্রিনশট)
  └── Gemini free tier (বিশ্লেষণ)
```

এই মোডে Chromium লাগে না:

| আগে (PC mode) | এখন (serverless) |
| --- | --- |
| Playwright দিয়ে ক্রল | `fetch` + cheerio (server-rendered HTML) |
| লোকাল Lighthouse | PageSpeed Insights API |
| Playwright দিয়ে PDF | PDFKit (সরাসরি JSON থেকে) |
| PocketBase (SQLite + ফাইল) | Neon Postgres (`audits`, `audit_files`) |

`backend/.env`-এ `DATABASE_URL` সেট করলেই এই মোড চালু হয়। সেট না থাকলে পুরনো
PocketBase মোডই ডিফল্ট — অর্থাৎ এখনকার চলমান সেটআপ ভাঙবে না।

---

## ০. যা যা লাগবে

| জিনিস | কোথায় | কার্ড? |
| --- | --- | --- |
| GitHub repo | `cartory7107/roastifyrs` | না |
| Neon account | <https://neon.com> | **না** |
| Render account | <https://render.com> (GitHub দিয়ে সাইন-ইন) | **না** |
| Vercel account | <https://vercel.com> | না |
| Gemini API key | <https://aistudio.google.com/apikey> | না |
| PSI API key (ঐচ্ছিক) | নিচে ধাপ ২ক | না |

---

## ১. Neon Postgres (৫ মিনিট)

1. <https://neon.com> → **Sign up** → GitHub দিয়ে লগইন করো।
2. **Create project**:
   - Name: `rostify`
   - Region: **Singapore (ap-southeast-1)** — বাংলাদেশের জন্য সবচেয়ে কাছাকাছি।
   - Postgres version: ডিফল্ট (১৭) রাখো।
3. প্রজেক্ট খুলে **Connect** বাটনে চাপো।
4. **Connection string** সেকশনে:
   - **Pooled connection** টগল **ON** করো (হোস্টে `-pooler` দেখবে)। serverless-এর
     জন্য এটাই দরকার — বেশি কানেকশন খুললেও Neon খুশি থাকে।
   - **Copy** করো। দেখতে এমন হবে:

     ```
     postgresql://neondb_owner:XXXXXXXX@ep-cool-name-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
     ```

5. এই স্ট্রিংটা কোথাও নিরাপদে রাখো। **এটাই `DATABASE_URL`** — এতে পাসওয়ার্ড আছে,
   তাই git-এ commit বা কারও সাথে শেয়ার করো না।

> টেবিল নিজে বানাতে হবে না। API প্রথমবার চালু হওয়ার সময় `audits` আর `audit_files`
> টেবিল (সহ ইনডেক্স) নিজেই তৈরি করে নেয়।

**ফ্রি প্ল্যানের সীমা:** ১ GB storage, ১০০ CU-hours/মাস, ৫ GB egress, ৫ মিনিট
idle থাকলে compute sleep — খরচ শূন্য। ছোট অডিটের জন্য এটা যথেষ্ট।

---

## ২. Render (API হোস্ট, ১০ মিনিট)

1. <https://dashboard.render.com> → GitHub দিয়ে সাইন-ইন।
2. **New** → **Blueprint** → `cartory7107/roastifyrs` রিপো বেছে নাও → **Connect**।
3. Render রিপো-র `render.yaml` পড়ে `rostify-api` সার্ভিস বানাবে। **Apply** চাপো।
4. **Environment** ট্যাবে গিয়ে ভ্যালুগুলো বসাও:

   | Key | Value |
   | --- | --- |
   | `DATABASE_URL` | ধাপ ১-এ কপি করা **pooled** Neon স্ট্রিং |
   | `GEMINI_API_KEY` | Gemini key (বাধ্যতামূলক নয়, কিন্তু ছাড়া AI অংশ কমবে) |
   | `SERPER_API_KEY` | ঐচ্ছিক — competitor/SERP |
   | `SEODATA_API_KEY` | ঐচ্ছিক — keyword volume |
   | `OPENPAGERANK_API_KEY` | ঐচ্ছিক — domain authority |
   | `PSI_API_KEY` | ঐচ্ছিক — নিচে ২ক দেখো |

   বাকি সব (`NODE_ENV`, `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD`, `TRUST_PROXY`,
   `CORS_ORIGINS`, `MAX_CONCURRENT_AUDITS`) `render.yaml` থেকেই বসে যাবে।
5. **Save** করলে প্রথম ডিপ্লয় শুরু হবে (~৩–৫ মিনিট)।
6. উপরে ড্যাশবোর্ডে সার্ভিসের URL পাবে, যেমন
   `https://rostify-api.onrender.com` (নাম আগে থেকে কেউ নিয়ে নিলে শেষে random
   suffix থাকবে)।
7. যাচাই করো:

   ```
   https://<render-url>/health         → {"ok":true,...}
   https://<render-url>/health/ready   → {"ok":true,"database":"up",...}
   ```

   `database: "down"` এলে `DATABASE_URL` আবার চেক করো (pooled স্ট্রিং, `sslmode=require`)।

### ২ক. PageSpeed API key (ঐচ্ছিক, ফ্রি, কার্ড ছাড়া)

key ছাড়াও PSI চলে, কিন্তু anonymous কোটা সারা ইন্টারনেটের সাথে শেয়ার করা — প্রায়ই
`429 Quota exceeded` আসে। তখন performance স্কোর "not measured" হয় (মোট স্কোরে ধরা হয় না)।

নিজের ফ্রি key বানাতে:

1. <https://console.cloud.google.com/> → নতুন প্রজেক্ট (billing লাগবে না)।
2. **APIs & Services → Library → PageSpeed Insights API → Enable**।
3. **APIs & Services → Credentials → Create credentials → API key**।
4. key কপি করে Render-এ `PSI_API_KEY` হিসেবে বসাও → **Manual Deploy → Deploy latest**।

key না থাকলেও স্ক্রিনশট আসবে — PSI ব্যর্থ হলে বিনামূল্যের WordPress **mShots**
ব্যাকআপ ব্যবহার হয়।

> Render Free: ১৫ মিনিট কোনো রিকোয়েস্ট না এলে সার্ভিস ঘুমায়। পরের রিকোয়েস্টে
> ৩০–৬০ সেকেন্ড cold start হতে পারে। চাইলে <https://uptimerobot.com> (ফ্রি) দিয়ে
> ১০ মিনিট পর পর `/health` ping করলে ঘুমাবে না — মাসে ৭৫০ ঘণ্টা ফ্রি, এক মাস ≈ ৭৩০
> ঘণ্টা, তাই একটি সার্ভিস ২৪/৭ চালানো যায়।

---

## ৩. Vercel (ফ্রন্টএন্ড, ৫ মিনিট)

1. <https://vercel.com/new> → `cartory7107/roastifyrs` import করো।
2. **Root Directory** → `frontend` সেট করো (Edit বাটন)।
3. **Environment Variables**-এ যোগ করো:

   ```
   NEXT_PUBLIC_API_BASE_URL = https://<render-url>
   ```

   (`https://` সহ, শেষে slash ছাড়া।)
4. **Deploy** চাপো।

`NEXT_PUBLIC_*` বিল্ডের সময় bundle-এ বসে যায়, তাই API URL বদলালে Vercel-এ
**Redeploy** করতে হবে।

### ডোমেইন (ঐচ্ছিক)

Cloudflare DNS-এ (DNS only, প্রোক্সি OFF):

| Type | Name | Target |
| --- | --- | --- |
| CNAME | `app` বা `roastify` | `cname.vercel-dns.com` |

নতুন ডোমেইন ব্যবহার করলে Render-এর `CORS_ORIGINS`-এ সেটিও যোগ করো (কমা দিয়ে আলাদা)।

---

## ৪. প্রথম অডিট

1. Vercel URL খোলো → একটি site URL দাও → **Run audit**।
2. ১–৩ মিনিট অপেক্ষা করো। Render-এর লগে ধাপগুলো দেখতে পাবে।
3. রিপোর্টে থাকবে: overall score + grade, ৬টি ক্যাটাগরি, findings, keywords,
   competitors, স্ক্রিনশট, আর **Download PDF**।

Neon-এ ডেটা দেখতে: Neon SQL Editor →

```sql
SELECT id, target_url, status, created_at FROM audits ORDER BY created_at DESC LIMIT 10;
SELECT audit_id, filename, mime_type, length(bytes) FROM audit_files;
```

---

## ৫. খরচ

| সার্ভিস | ফ্রি সীমা | কার্ড |
| --- | --- | --- |
| Neon | ১ GB/project, ১০০ CU-h/মাস, ৫ GB egress, idle sleep | লাগে না |
| Render Web Service | ৭৫০ ঘণ্টা/মাস, ০.১ CPU / ৫১২ MB, ১৫ মিনিট idle sleep | লাগে না |
| Vercel Hobby | ১০০ GB bandwidth/মাস | লাগে না |
| Gemini | free tier (rate-limited) | লাগে না |
| PageSpeed Insights | anonymous quota, বা ফ্রি key | লাগে না |

মোট খরচ: **$0**।

---

## ৬. সমস্যা ও সমাধান

| উপসর্গ | কারণ / সমাধান |
| --- | --- |
| `/health/ready` → `database: down` | `DATABASE_URL` ভুল, non-pooled হোস্ট, বা Neon suspend। Neon ড্যাশবোর্ডে project active কিনা দেখো; স্ট্রিং-এ `?sslmode=require` আছে কিনা। |
| প্রথম রিকোয়েস্ট ৩০–৬০ সেকেন্ড | Render Free cold start — স্বাভাবিক। UptimeRobot দিয়ে warm রাখো। |
| `Quota exceeded ... pagespeedonline` | anonymous PSI কোটা শেষ। `PSI_API_KEY` বসাও। তখন performance "not measured" থাকবে, মোট স্কোর ভাঙবে না। |
| competitor-এর স্ক্রিনশট নেই | serverless মোডে কোটা বাঁচাতে competitor screenshot বন্ধ; শুধু target-এর desktop/mobile নেওয়া হয়। |
| PDF ডাউনলোড 404 | অডিট এখনো শেষ হয়নি বা `pdf_url` খালি। রিপোর্ট লোড হওয়ার পর আবার চাপো। |
| ব্রাউজারে CORS error | Render-এ `CORS_ORIGINS`-এ ফ্রন্টএন্ড origin যোগ করো (`https://...`, কমা দিয়ে একাধিক)। |
| Build fail: `pnpm: not found` | `render.yaml`-এর build command ব্যবহার করো; `packageManager` ফিল্ড পিন করা আছে। |
| স্ক্রিনশট নেই, PDF-এও নেই | PSI + mShots দুটোই ব্যর্থ (সাইট slow/blocked)। PSI key দিলে সাধারণত ঠিক হয়। |

---

## ৭. লোকাল থেকে serverless মোড টেস্ট

```powershell
cd backend
$env:DATABASE_URL="postgresql://...pooler.../neondb?sslmode=require"
$env:GEMINI_API_KEY="..."
pnpm dev
```

অথবা `backend/.env`-এ লিখে স্বাভাবিকভাবে `pnpm dev`। `DATABASE_URL` থাকলে
PocketBase লাগবে না; স্ক্রিনশট/PDF `/files/...` রুট থেকে সার্ভ হবে।

---

## ৮. PC-র পুরনো সেটআপ বন্ধ করা (শেষ ধাপ)

serverless পথ পুরোপুরি যাচাই হওয়ার **আগে** কিছু বন্ধ করো না। সব ঠিক থাকলে:

1. Cloudflare Tunnel থামাও: `cloudflared service uninstall` (এবং PC-র scheduled
   task/startup entry)।
2. `roastifys.cartory.top` → Cloudflare DNS-এ Vercel-এর `cname.vercel-dns.com`
   (DNS only)।
3. `roastifys-api.*` / `roastifys-pb.*` DNS রেকর্ড চাইলে মুছে দাও।
4. `pb/pb_data`-র একটা ব্যাকআপ ZIP রাখো (পুরনো অডিট রিপোর্ট)।

ততক্ষণ পুরনো PocketBase স্ট্যাক যেমন আছে তেমনই থাকবে — এটি ডিফল্ট মোড।

---

## ৯. নিরাপত্তা

- Neon password, Gemini key, PSI key — শুধু Render-এর Environment-এ; git-এ নয়।
- `.env` ফাইল gitignored; কখনো commit করো না।
- `ALLOW_PRIVATE_HOSTS=false` রাখো (SSRF বন্ধ)।
- কোনো key ফাঁস হলে Neon/Render/Google কনসোল থেকে rotate করো।
- Gemini free tier-এ পাঠানো প্রম্পট Google-এর প্রোডাক্ট উন্নয়নে ব্যবহার হতে পারে —
  গোপনীয় কনটেন্ট অডিট করলেpaid provider ভাবো।
