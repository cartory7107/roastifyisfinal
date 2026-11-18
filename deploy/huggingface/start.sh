#!/usr/bin/env bash
# Boots PocketBase, the Fastify API and Next.js inside one container, then
# hands port 7860 to nginx. Hugging Face keeps the Space alive while requests
# arrive; the frontend polls every two seconds during an audit, so a run always
# outlives the free-tier idle timer.
set -euo pipefail

APP_PORT="${APP_PORT:-7860}"
WEB_PORT=3000
API_PORT=4000
PB_PORT=8090
DATA_DIR="${PB_DATA_DIR:-/data/pb_data}"

log() { printf '[rostify] %s\n' "$*"; }

mkdir -p "$DATA_DIR" /tmp/nginx

# Public URL of this Space. HF exposes SPACE_HOST (e.g. user-space.hf.space).
PUBLIC_URL="${POCKETBASE_PUBLIC_URL:-}"
if [ -z "$PUBLIC_URL" ] && [ -n "${SPACE_HOST:-}" ]; then
  PUBLIC_URL="https://${SPACE_HOST}"
fi

export NODE_ENV=production
export POCKETBASE_URL="http://127.0.0.1:${PB_PORT}"
export POCKETBASE_PUBLIC_URL="$PUBLIC_URL"
export CORS_ORIGINS="${CORS_ORIGINS:-$PUBLIC_URL}"
export WEB_BASE_URL="http://127.0.0.1:${APP_PORT}"
export INTERNAL_API_BASE_URL="http://127.0.0.1:${API_PORT}"
export TRUST_PROXY=true
export ALLOW_PRIVATE_HOSTS=false
export MAX_CONCURRENT_AUDITS="${MAX_CONCURRENT_AUDITS:-2}"

log "public url: ${PUBLIC_URL:-<unset>}"

# 1. Superuser (idempotent: upsert updates the password on every boot).
if [ -n "${POCKETBASE_ADMIN_EMAIL:-}" ] && [ -n "${POCKETBASE_ADMIN_PASSWORD:-}" ]; then
  pocketbase superuser upsert \
    "$POCKETBASE_ADMIN_EMAIL" "$POCKETBASE_ADMIN_PASSWORD" \
    --dir="$DATA_DIR" || log "warning: superuser upsert failed"
else
  log "warning: set POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASSWORD secrets"
fi

# 2. PocketBase.
pocketbase serve --http="127.0.0.1:${PB_PORT}" --dir="$DATA_DIR" &
PB_PID=$!

for _ in $(seq 1 90); do
  if curl -fsS "http://127.0.0.1:${PB_PORT}/api/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

# 3. Create the `audits` collection and raise the JSON cap (idempotent).
node /app/backend/dist/scripts/setup-pocketbase.js || log "warning: setup-pocketbase failed"

# 4. Audit API.
PORT="$API_PORT" HOST=127.0.0.1 node /app/backend/dist/index.js &
API_PID=$!

# 5. Web app (renders the live report and the /print page used for the PDF).
(cd /app && pnpm --filter frontend start) &
WEB_PID=$!

# 6. Reverse proxy on the port Hugging Face expects.
nginx -g 'daemon off;' &
NGINX_PID=$!

cleanup() {
  log "shutting down"
  kill "$PB_PID" "$API_PID" "$WEB_PID" "$NGINX_PID" 2>/dev/null || true
}
trap cleanup TERM INT

wait -n || true
log "a child process exited - stopping the container so the Space restarts"
cleanup
exit 1
