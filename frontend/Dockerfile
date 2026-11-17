FROM node:20-bookworm-slim

ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    NEXT_TELEMETRY_DISABLED=1

RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

WORKDIR /app

# Workspace manifests first so dependency layers cache independently of source.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY frontend/package.json frontend/
RUN pnpm install --frozen-lockfile --filter frontend...

COPY packages packages
COPY frontend frontend

# Baked into the client bundle: must be the API URL the *browser* can reach.
# Changing it requires rebuilding this image.
ARG NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL \
    NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN pnpm --filter frontend build

USER node
EXPOSE 3000
CMD ["pnpm", "--filter", "frontend", "start"]
