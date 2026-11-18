# Docker Space image for Rostify (Hugging Face).
#
# Upload this file plus `start.sh`, `nginx.conf` and `README.md` to a Space
# created with the **Docker** SDK. Everything else is pulled from the public
# GitHub repository at build time, so the Space stays in sync with `main`
# whenever it is rebuilt or restarted.
#
# One container runs the whole product behind port 7860:
#   /        -> Next.js web app  (127.0.0.1:3000)
#   /svc/*   -> Fastify audit API (127.0.0.1:4000)
#   /api/*   -> PocketBase        (127.0.0.1:8090)
#   /_/*     -> PocketBase admin UI

FROM mcr.microsoft.com/playwright:v1.65.1-jammy

ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1

RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

RUN apt-get update \
 && apt-get install -y --no-install-recommends nginx curl unzip git ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# PocketBase — keep this in sync with the local binary version.
ARG PB_VERSION=0.40.6
RUN curl -fsSL -o /tmp/pb.zip "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_amd64.zip" \
 && unzip -q /tmp/pb.zip pocketbase -d /usr/local/bin \
 && chmod +x /usr/local/bin/pocketbase \
 && rm -f /tmp/pb.zip

# Application source.
ARG REPO_URL=https://github.com/cartory7107/roastifyrs.git
ARG REPO_REF=main
RUN git clone --depth 1 --branch "${REPO_REF}" "${REPO_URL}" /app

WORKDIR /app
RUN pnpm install --frozen-lockfile

# One origin for everything, so the browser calls `/svc/*` on this same host.
# The absolute cartory URL stays out of this image (Vercel keeps using it).
RUN rm -f frontend/.env.production
ARG NEXT_PUBLIC_API_BASE_URL=/svc
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}
RUN pnpm --filter backend build && pnpm --filter frontend build

COPY nginx.conf /etc/nginx/nginx.conf
COPY start.sh /usr/local/bin/start.sh

RUN chmod +x /usr/local/bin/start.sh \
 && mkdir -p /data/pb_data /tmp/nginx /var/log/nginx /var/lib/nginx \
 && chown -R 1000:1000 /app /data /tmp/nginx /var/log/nginx /var/lib/nginx /etc/nginx

# Hugging Face runs containers as uid 1000.
USER 1000

EXPOSE 7860
CMD ["/usr/local/bin/start.sh"]
