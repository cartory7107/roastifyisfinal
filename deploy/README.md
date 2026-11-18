# One-host production deploy (PC ছাড়া, push-to-deploy)

এই ফাইলটা ফলো করলে পুরো প্রোডাক্ট — **frontend + API + PocketBase + Cloudflare Tunnel** — একটা ফ্রি সার্ভারে চলবে, আর `main`-এ push করলেই GitHub Actions নিজে থেকে নতুন কোড ডিপ্লয় করবে। তোমার PC চালু রাখতে হবে না।

> **Google Cloud-এ করতে চাইলে:** [`gcp/README.md`](gcp/README.md) — একই স্ট্যাক,
> শুধু VM তৈরির ধাপ GCP-নির্দিষ্ট (e2-medium, startup script, X64 runner)।

```
তোমার PC ──git push──▶ GitHub
                          │  (self-hosted runner)
                          ▼
        Oracle Always Free VM
        ┌──────────────────────────────────────────┐
        │  cloudflared                             │
        │    ├── roastifys.cartory.top     → web   │
        │    ├── roastifys-api.cartory.top → api   │
        │    └── roastifys-pb.cartory.top  → pb    │
        │  web (Next.js) · api (Fastify+Chromium)  │
        │  pocketbase (volume: pb_data)            │
        └──────────────────────────────────────────┘
```

কেন Vercel-এ পুরোটা হয় না: অডিট একটা আসল Chromium চালায় (স্ক্রিনশট, Lighthouse, PDF) ২–৫ মিনিট ধরে, আর ফাইল পেসিস্টেন্ট ডিস্কে রাখে। Vercel Function-এ ব্রাউজার নেই, ডিস্ক নেই, আর Hobby-তে সময়সীমা অনেক কম। বিস্তারিত: [`../VERCEL.md`](../VERCEL.md)।

**খরচ:** Oracle Always Free Ampere A1 (4 OCPU / 24 GB RAM) — কার্ড শুধু ভেরিফিকেশনে, চার্জ হয় না। GitHub Actions self-hosted runner ফ্রি।

---

## যা যা লাগবে

| জিনিস | কোথায় |
| --- | --- |
| Oracle Cloud অ্যাকাউন্ট | https://cloud.oracle.com (Always Free) |
| এই রিপোতে admin/owner অ্যাক্সেস | https://github.com/cartory7107/roastifyrs |
| টানেল credentials ফাইল | তোমার PC-তে `%USERPROFILE%\.cloudflared\16a4602f-97ac-4029-9451-43dc2ad4dbb6.json` |
| API কী-গুলো | তোমার PC-র `backend/.env` |

---

## ধাপ ১ — VM তৈরি (≈ ৫ মিনিট)

1. Oracle Cloud → **Compute → Instances → Create instance**
2. **Image:** Ubuntu 22.04 (aarch64) · **Shape:** `VM.Standard.A1.Flex`
   → **4 OCPU, 24 GB RAM** (Always Free-তে এটাই максимум, কম দিলেও চলবে; ন্যূনতম 2 OCPU / 8 GB রাখো)
3. **Boot volume:** 100 GB (Free tier-এ ২০০ GB পর্যন্ত)
4. SSH key আপলোড করো (অথবা Oracle-এর তৈরি key ডাউনলোড করে রাখো)
5. Create → পাবলিক IP নোট করো

> ইনবাউন্ড পোর্ট খোলার দরকার **নেই** — Cloudflare Tunnel আউটবাউন্ড কনেকশনে চলে। শুধু SSH (22) খোলা থাকলেই যথেষ্ট, সেটা ডিফল্টেই থাকে।

লগইন:

```bash
ssh ubuntu@<VM_PUBLIC_IP>
```

## ধাপ ২ — Docker ইনস্টল (≈ ৩ মিনিট)

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER
```

গ্রুপ পরিবর্তন কার্যকর করতে একবার লগআউট/লগইন করো (অথবা `newgrp docker`):

```bash
docker run --rm hello-world
docker compose version
```

## ধাপ ৩ — সিক্রেট ফাইল (≈ ৫ মিনিট)

সিক্রেট checkout-এর বাইরে থাকে, কারণ `actions/checkout` প্রতিবার untracked ফাইল মুছে ফেলে। ফিক্সড পাথ:

```
/opt/rostify/secrets/.env
/opt/rostify/secrets/cloudflared-credentials.json
```

```bash
sudo mkdir -p /opt/rostify/secrets
sudo chown -R $USER:$USER /opt/rostify/secrets
chmod 700 /opt/rostify/secrets
```

### `.env` বানাও

```bash
nano /opt/rostify/secrets/.env
```

`deploy/.env.example` কপি করে ভ্যালুগুলো বসাও। সবচেয়ে জরুরি লাইনগুলো:

| কী | মান |
| --- | --- |
| `POCKETBASE_ADMIN_EMAIL` | `admin@rostify.local` |
| `POCKETBASE_ADMIN_PASSWORD` | তোমার শক্ত পাসওয়ার্ড (PocketBase নিজেই বানিয়ে নেবে) |
| `GEMINI_API_KEY` | তোমার ফ্রি Gemini কী |
| `SERPER_API_KEY` | সার্চ/কম্পিটিটরের জন্য |
| `CORS_ORIGINS` | `https://roastifys.cartory.top,https://*.vercel.app` |
| `NEXT_PUBLIC_API_BASE_URL` | `https://roastifys-api.cartory.top` |
| `POCKETBASE_PUBLIC_URL` | `https://roastifys-pb.cartory.top` |
| `LLM_PROVIDER` | `auto` (Gemini → Ollama → Groq) |

> `POCKETBASE_ADMIN_PASSWORD` আর `POCKETBASE_ADMIN_EMAIL` একবার সেট করলে বদলাবে না — PocketBase প্রথম বুটেই এই অ্যাকাউন্ট বানায়।

লোকাল `backend/.env` থেকে কীগুলো হাতে কপি করো (ফাইলটা Git-এ যায় না, তাই GitHub-এও থাকবে না):

```bash
chmod 600 /opt/rostify/secrets/.env
```

### টানেল credentials

তোমার PC থেকে ফাইলটা সার্ভারে পাঠাও (PowerShell-এ):

```powershell
scp "$env:USERPROFILE\.cloudflared\16a4602f-97ac-4029-9451-43dc2ad4dbb6.json" ubuntu@<VM_PUBLIC_IP>:/tmp/cloudflared-credentials.json
```

সার্ভারে:

```bash
mv /tmp/cloudflared-credentials.json /opt/rostify/secrets/cloudflared-credentials.json
chmod 600 /opt/rostify/secrets/cloudflared-credentials.json
```

> এটাই সেই টানেল যেটা এখন তোমার PC চালাচ্ছে। DNS বা hostname কিছু বদলাতে হবে না — শুধু কানেক্টর PC থেকে সার্ভারে যাবে।

## ধাপ ৪ — Self-hosted runner (≈ ৫ মিনিট)

GitHub → রিপো → **Settings → Actions → Runners → New self-hosted runner** → **Linux**।

> Ampere A1 হলো ARM মেশিন, তাই ড্রপডাউনে **ARM64** বেছে নাও (X64 নয়)। পেজে যে কমান্ড দেখাবে ঠিক সেটাই সার্ভারে চালাও — ভার্সন নম্বর বদলায়, তাই কপি করাই নিরাপদ:

```bash
mkdir -p ~/actions-runner && cd ~/actions-runner
# ... পেজ থেকে download + tar কমান্ড ...
./config.sh --url https://github.com/cartory7107/roastifyrs --token <RUNNER_TOKEN>
```

`config.sh` জিজ্ঞেস করলে:
- runner group: **Default**
- name: `oracle-rostify`
- labels: খালি রাখো (ডিফল্ট `self-hosted`, `Linux`, `X64`-ই যথেষ্ট)
- work folder: ডিফল্ট

সার্ভিস হিসেবে ইনস্টল করো, যাতে VM রিবুট হলেও চলে:

```bash
sudo ./svc.sh install $USER
sudo ./svc.sh start
sudo ./svc.sh status
```

> runner যে ইউজারে চলছে (`ubuntu`) সে অবশ্যই `docker` গ্রুপে থাকতে হবে — ধাপ ২-এ করা হয়েছে। `sudo` দিয়ে চালালে Docker permission সমস্যা হবে, তাই `sudo ./svc.sh install $USER`।

## ধাপ ৫ — প্রথম ডিপ্লয়

GitHub → **Actions → Deploy → Run workflow** (branch `main`)।

অথবা শুধু কিছু push করলেই ট্রিগার হবে। শেষ হলে:

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f api
```

প্রথম build-এ ১০–১৫ মিনিট লাগতে পারে (Playwright + Next.js ইমেজ); পরেরবার ক্যাশে ২–৩ মিনিট।

> runner রেজিস্টার করার আগে push করলে Deploy run-টা **Queued** অবস্থায় অপেক্ষা করবে — এটা স্বাভাবিক। ধাপ ৪ শেষ হওয়া মাত্রই সেটা নিজে থেকে চলবে, আলাদা করে কিছু করতে হবে না।

## ধাপ ৬ — যাচাই

```bash
curl -s https://roastifys-api.cartory.top/health
curl -s https://roastifys-pb.cartory.top/api/health
curl -sI https://roastifys.cartory.top | head -5
```

তারপর ব্রাউজারে `https://roastifys.cartory.top` খুলে একটা আসল অডিট চালাও (স্ক্রিনশট + PDF সহ শেষ হতে হবে)।

## ধাপ ৭ — PC-র সার্ভিস বন্ধ করো ⚠️

একই টানেলে দুই জায়গা থেকে কানেক্টর চললে ট্রাফিক দুই সার্ভারে ভাগ হয়ে যাবে — তখন দুইটা আলাদা PocketBase ডেটাবেস হয়ে যাবে, রিপোর্ট এলোমেলো দেখাবে।

সার্ভার ঠিকভাবে চলা কনফার্ম করার **পরে** PC-তে:

```powershell
# টানেল বন্ধ
Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process

# লোকাল সার্ভিসগুলোও বন্ধ করতে পারো (PocketBase / API / web)
Get-NetTCPConnection -LocalPort 8090,4000,3000 -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

> এখন থেকে ডেটা সার্ভারের `pb_data` ভলিউমে জমা হবে। PC-র পুরোনো অডিটগুলো দরকার হলে নিচের "পুরোনো ডেটা আনা" দেখো।

---

## push করলে কী হয়

| জিনিস | কোথায় চলে | push-এ অটো আপডেট? |
| --- | --- | --- |
| `roastifys.cartory.top` | VM (`web`) | ✅ হ্যাঁ (Deploy workflow) |
| `roastifys-api.cartory.top` | VM (`api`) | ✅ হ্যাঁ |
| `roastifys-pb.cartory.top` | VM (`pocketbase`) | ✅ হ্যাঁ (ইমেজ আপডেট) |
| `roastifyrs.vercel.app` | Vercel (ঐচ্ছিক ফ্রন্টএন্ড) | ✅ হ্যাঁ (Vercel integration) |

Vercel আর VM — দুটোই একই `https://roastifys-api.cartory.top` কল করে, তাই দুই জায়গায় সাইট একইভাবে কাজ করবে। শুধু `roastifys.cartory.top` ডোমেইনটা একটার দিকে পয়েন্ট করাতে হবে:

- **VM দেখাতে চাইলে:** Cloudflare DNS-এ `roastifys` আগের টানেল রেকর্ডেই থাকবে (এখন যেমন আছে) — কিছু করতে হবে না।
- **Vercel দেখাতে চাইলে:** `roastifys` CNAME → `cname.vercel-dns.com`, Proxy **DNS only**।

---

## পুরোনো ডেটা আনা (ঐচ্ছিক)

PC-র `roastifyrs/pb/pb_data` থেকে অডিট হিস্ট্রি নিতে চাইলে:

```powershell
# PC-তে
tar -czf pb_data_backup.tgz -C .\pb pb_data
scp .\pb_data_backup.tgz ubuntu@<VM_PUBLIC_IP>:/tmp/
```

```bash
# সার্ভারে (স্ট্যাক বন্ধ থাকা অবস্থায়)
docker compose -f docker-compose.prod.yml stop pocketbase
docker run --rm -v rostify_pb_data:/pb_data -v /tmp:/backup alpine \
  sh -c "rm -rf /pb_data/* && tar -xzf /backup/pb_data_backup.tgz -C /pb_data --strip-components=1"
docker compose -f docker-compose.prod.yml up -d pocketbase
```

ভলিউমের নাম চেক করতে: `docker volume ls | grep pb_data`

---

## আপডেট / রোলব্যাক

```bash
# ম্যানুয়াল রিডিপ্লয় (workflow যা করে তাই)
docker compose -f docker-compose.prod.yml build api
docker compose -f docker-compose.prod.yml up -d --remove-orphans

# লগ
docker compose -f docker-compose.prod.yml logs -f --tail=200

# শুধু API রিস্টার্ট
docker compose -f docker-compose.prod.yml restart api

# আগের কমিটে ফিরে যেতে
cd ~/actions-runner/_work/roastifyrs/roastifyrs
git log --oneline -5
# GitHub-এ revert commit করাই সবচেয়ে সহজ — push করলেই অটো ডিপ্লয় হবে
```

---

## সমস্যা হলে

| লক্ষণ | কারণ / সমাধান |
| --- | --- |
| Actions-এ `Missing /opt/rostify/secrets/.env` | ধাপ ৩-এর পাথ/নাম ঠিক করো, `chmod 600` দাও |
| `permission denied ... docker.sock` | runner ইউজার `docker` গ্রুপে নেই → `sudo usermod -aG docker ubuntu`, সার্ভিস রিস্টার্ট |
| `pocketbase` healthy হচ্ছে না | `docker compose -f docker-compose.prod.yml logs pocketbase`; `pb_data` ভলিউমের মালিকানা `chown -R 1000:1000` |
| `init` সার্ভিস ফেইল | সাধারণত ভুল `POCKETBASE_ADMIN_EMAIL/PASSWORD` — PocketBase প্রথম বুটে যেটা বানিয়েছে সেটাই দিতে হবে |
| সাইট 502/530 | `cloudflared` কনটেইনার বন্ধ → `docker compose -f docker-compose.prod.yml logs cloudflared`; credentials ফাইল আছে কি না দেখো |
| অডিট চলে না, `/health` ঠিক | `CORS_ORIGINS`-এ সাইটের ডোমেইন আছে কি না; `docker compose ... logs api` |
| build-এ RAM শেষ | 2 GB swap যোগ করো: `sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile` |
| দুই জায়গায় আলাদা ডেটা | PC-র `cloudflared` এখনো চলছে → ধাপ ৭ |

---

## নিরাপত্তা

- `.env` আর `credentials.json` কখনো কমিট হয় না — `.gitignore`-এ আছে, আর Docker build context থেকেও বাদ (`.dockerignore`)।
- API-তে `ALLOW_PRIVATE_HOSTS=false`, তাই কেউ `http://localhost` অডিট করে সার্ভারের ভেতর ঘাঁটতে পারবে না।
- 8090/4000/3000 পোর্ট শুধু `127.0.0.1`-এ বাঁধা — বাইরে থেকে সরাসরি ঢোকা যায় না, শুধু টানেল দিয়ে।
- PocketBase অ্যাডমিন প্যানেল পাবলিক হোস্টে আছে; পাসওয়ার্ড শক্ত রাখো, আর দরকার হলে Cloudflare Access দিয়ে `roastifys-pb.cartory.top/_/` লক করে দাও।
