# Google Cloud-এ পুরো প্রোডাক্ট (PC ছাড়া, push-to-deploy)

এই গাইডে পুরো প্রোডাক্ট — **web + API + PocketBase + Cloudflare Tunnel** — একটা Google Cloud VM-এ চলবে। `main`-এ push করলেই GitHub Actions নতুন কোড ডিপ্লয় করবে, PC বন্ধ থাকলেও সাইট ও টুল কাজ করবে।

```
তোমার PC ──git push──▶ GitHub ──(self-hosted runner)──▶ GCP VM
                                                        ├── web      (Next.js)
                                                        ├── api      (Fastify + Chromium)
                                                        ├── pocketbase (ডেটা + ফাইল)
                                                        └── cloudflared (টানেল)
```

> **খরচ:** Google Cloud **Free Trial** — `$300` ক্রেডিট, ৯০ দিন। কার্ড লাগবে (ভেরিফিকেশনে), কিন্তু ট্রায়াল শেষ না হওয়া পর্যন্ত **চার্জ হয় না**। e2-medium (2 vCPU / 4 GB) চালালে মাসে ~$24 — অর্থাৎ ৯০ দিনের ট্রায়ালে আরামে ধরে।

---

## ধাপ ০ — পেমেন্ট মেথড আছে কি না দেখো

Google One-এর পেমেন্ট মেথডই কাজে লাগবে (নতুন কার্ড লাগবে না):

1. https://myaccount.google.com/payments-and-subscriptions
2. **Payment methods** → Visa/Mastercard আছে কি না দেখো

থাকলে GCP billing account-এ সেটাই বেছে নিতে পারবে। শুধু Google Play ব্যালেন্স/অপারেটর বিলিং থাকলে নতুন কার্ড লাগবে।

## ধাপ ১ — Free Trial চালু (≈ ৫ মিনিট)

1. https://console.cloud.google.com → Google অ্যাকাউন্ট দিয়ে লগইন
2. শর্তাবলি মেনে **Start free** → দেশ: **Bangladesh**
3. পেমেন্ট মেথড সিলেক্ট করো (আগের কার্ড) → **Start my free trial**
4. একটি **Project** তৈরি করো (নাম: `rostify`)

> অটো-আপগ্রেড **বন্ধ** রাখো (Billing → Account settings → *Upgrade* বাটনে হাত দিও না)। ট্রায়াল শেষে সার্ভিস বন্ধ হবে, কার্ডে টাকা কাটবে না।

### বাজেট অ্যালার্ট (সুপারিশ)

Billing → **Budgets & alerts** → Create budget → Amount `$1` → ৫০%/৯০% ইমেইল অ্যালার্ট।

## ধাপ ২ — VM তৈরি (≈ ৫ মিনিট)

Compute Engine → **Create instance**:

| Field | Value |
| --- | --- |
| Name | `rostify` |
| Region | `asia-south1` (Mumbai) বা `asia-southeast1` (Singapore) |
| Machine type | **E2 → e2-medium (2 vCPU, 4 GB)** |
| Boot disk | **Ubuntu 22.04 LTS**, size **30 GB**, Balanced SSD |
| Firewall | ✅ Allow SSH · ⬜ HTTP · ⬜ HTTPS (দরকার নেই) |
| Advanced → Management → Automation → **Startup script** | `deploy/gcp/startup.sh`-এর পুরো কনটেন্ট পেস্ট করো |

**Create** → ২–৩ মিনিট অপেক্ষা করো (startup script নিজেই Docker + swap সেট করে)।

> ইনবাউন্ড পোর্ট খোলার দরকার নেই — টানেল আউটবাউন্ডে চলে। GCP-এর ডিফল্ট ফায়ারওয়াল ঠিক আছে।

## ধাপ ৩ — VM-এ ঢোকো (≈ ১ মিনিট)

Compute Engine → VM-এর পাশে **SSH** বাটনে ক্লিক (ব্রাউজার টার্মিনাল খুলবে, key সেটআপ লাগে না)।

```bash
docker --version
docker compose version
free -h                 # swap দেখা যাবে
ls -ld /opt/rostify/secrets
```

> ⚠️ GCP-এর লগইন ইউজার তোমার Google অ্যাকাউন্টের নাম (যেমন `cartory7107`), `ubuntu` নয়। তাই পরের কমান্ডে `$USER` ব্যবহার করো, `ubuntu` লিখো না।

প্রথমবার Docker গ্রুপ কার্যকর করতে একবার লগআউট/লগইন (SSH বন্ধ করে আবার খোলো):

```bash
docker run --rm hello-world
```

## ধাপ ৪ — সিক্রেট বসাও (≈ ৮ মিনিট)

```bash
nano /opt/rostify/secrets/.env
```

`deploy/.env.example`-এর কনটেন্ট পেস্ট করে ভ্যালু বসাও:

| কী | মান |
| --- | --- |
| `POCKETBASE_ADMIN_EMAIL` | `admin@rostify.local` |
| `POCKETBASE_ADMIN_PASSWORD` | শক্ত পাসওয়ার্ড (মনে রাখো) |
| `GEMINI_API_KEY` | তোমার ফ্রি Gemini কী |
| `SERPER_API_KEY` | সার্চ/কম্পিটিটর কী |
| `CORS_ORIGINS` | `https://roastifys.cartory.top,https://*.vercel.app` |
| `NEXT_PUBLIC_API_BASE_URL` | `https://roastifys-api.cartory.top` |
| `POCKETBASE_PUBLIC_URL` | `https://roastifys-pb.cartory.top` |
| `LLM_PROVIDER` | `auto` |

সংরক্ষণ: `Ctrl+O` → Enter → `Ctrl+X`, তারপর:

```bash
chmod 600 /opt/rostify/secrets/.env
```

### টানেল credentials

তোমার PC-তে ফাইলটা খোলো:

```
C:\Users\360\.cloudflared\16a4602f-97ac-4029-9451-43dc2ad4dbb6.json
```

পুরো কনটেন্ট কপি করো, তারপর VM-এ:

```bash
nano /opt/rostify/secrets/cloudflared-credentials.json
# পেস্ট করো → Ctrl+O, Enter, Ctrl+X
chmod 600 /opt/rostify/secrets/cloudflared-credentials.json
```

> এটাই তোমার বর্তমান টানেল। DNS/hostname কিছু বদলাবে না — শুধু কনেক্টর PC থেকে VM-এ যাবে।

## ধাপ ৫ — Self-hosted runner (≈ ৫ মিনিট)

GitHub → রিপো → **Settings → Actions → Runners → New self-hosted runner**

- OS: **Linux** · Architecture: **X64** (GCP VM x86_64, ARM নয়)
- পেজে যে download/config কমান্ড দেখাবে সেগুলো VM-এর SSH-এ চালাও:

```bash
mkdir -p ~/actions-runner && cd ~/actions-runner
# ... পেজ থেকে download + tar কমান্ড ...

./config.sh --url https://github.com/cartory7107/roastifyrs --token <RUNNER_TOKEN>
# runner group: Default · name: gcp-rostify · labels: খালি · work folder: ডিফল্ট

sudo ./svc.sh install $USER
sudo ./svc.sh start
sudo ./svc.sh status
```

> `install $USER`-এ `$USER` রাখো — GCP ইউজার `ubuntu` নয়।

## ধাপ ৬ — ডিপ্লয়

GitHub → **Actions → Deploy → Run workflow** (branch `main`)।

প্রথম build ১০–১৫ মিনিট (Playwright + Next.js ইমেজ)। শেষে VM-এ:

```bash
cd ~/actions-runner/_work/roastifyrs/roastifyrs
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f api
```

## ধাপ ৭ — যাচাই

```bash
curl -s https://roastifys-api.cartory.top/health
curl -s https://roastifys-pb.cartory.top/api/health
curl -sI https://roastifys.cartory.top | head -5
```

তারপর `https://roastifys.cartory.top` খুলে একটা ফুল অডিট (স্ক্রিনশট + PDF) চালাও।

## ধাপ ৮ — PC-র সার্ভিস বন্ধ ⚠️

একই টানেলে দুই কানেক্টর চললে ট্রাফিক দুই PocketBase-এ ভাগ হবে। VM ঠিকভাবে চলা কনফার্ম করার **পরে** PC-তে:

```powershell
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process
Get-NetTCPConnection -LocalPort 8090,4000,3000 -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

---

## খরচ ও সীমা (সৎ হিসাব)

| জিনিস | হিসাব |
| --- | --- |
| e2-medium (2 vCPU / 4 GB) | ~$0.0335/ঘণ্টা ≈ **$24/মাস** |
| 30 GB balanced disk | ~$3/মাস |
| Egress (স্ক্রিনশট/PDF) | প্রথম ২০০ GB/মাস ফ্রি (trial-এ ক্রেডিট থেকে) |
| **$300 ক্রেডিট** | ৪–৫ মাস ২৪/৭ চালানোর সমান, কিন্তু **ট্রায়াল ৯০ দিনে শেষ** |
| ট্রায়াল শেষে | VM বন্ধ হয়ে যাবে; আপগ্রেড না করলে বিল আসবে না |

**৯০ দিন পরের অপশন:** (১) Oracle Always Free-তে সরানো (একই compose, ২৪ GB RAM, চিরস্থায়ী ফ্রি — কার্ড লাগে), (২) paid চালু রাখা (~$27/মাস), (৩) VM বন্ধ করা।

### একদম ফ্রি রাখতে চাইলে (সীমিত)

GCP **Always Free** e2-micro (1 GB RAM) + swap দিয়েও চালানো যায়, কিন্তু:

- অডিট ২–৩ গুণ ধীর, একসাথে ২টা অডিটে OOM-এর ঝুঁকি
- `MAX_CONCURRENT_AUDITS=1` রাখতে হবে
- e2-micro শুধু `us-west1`, `us-central1`, `us-east1`-এ ফ্রি

হ্যাকাথন ডেমোর জন্য **trial e2-medium** অনেক নিরাপদ।

---

## সমস্যা হলে

| লক্ষণ | সমাধান |
| --- | --- |
| SSH-এ `docker: permission denied` | `sudo usermod -aG docker $USER` → SSH বন্ধ করে আবার খোলো |
| Startup script চলেনি | VM-এ `sudo bash` করে স্ক্রিপ্টটা আবার চালাও |
| build-এ "no space left on device" | `docker system prune -af`; disk 30 GB আছে কি না দেখো |
| `Deploy` run Queued | runner রেজিস্টার হয়নি — ধাপ ৫ |
| runner-এ `docker.sock` permission | `sudo ./svc.sh install $USER` (root নয়) দিয়ে আবার ইনস্টল |
| সাইট 530/502 | `docker compose -f docker-compose.prod.yml logs cloudflared`; credentials ফাইল আছে কি না |
| অডিট ফেইল | `logs api`; `.env`-এ Gemini/Serper কী ঠিক আছে কি না |
| VM মেমরি শেষ | swap আছে কি না (`free -h`), `MAX_CONCURRENT_AUDITS=1` |

---

## নিরাপত্তা

- `.env` ও `credentials.json` কেবল `/opt/rostify/secrets/`-এ, `chmod 600`
- checkout-এর বাইরে রাখা হয়েছে, কারণ `actions/checkout` untracked ফাইল মুছে ফেলে
- পোর্ট 8090/4000/3000 শুধু `127.0.0.1`-এ; বাইরে থেকে ঢোকা যায় না
- `ALLOW_PRIVATE_HOSTS=false` → কেউ `localhost` অডিট করে VM-এর ভেতর ঘাঁটতে পারবে না
