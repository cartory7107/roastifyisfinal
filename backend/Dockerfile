# Playwright's image already ships Chromium plus every system library the
# audits need (screenshots, Lighthouse, PDF render). Keep the tag in sync with
# the `playwright` version in pnpm-lock.yaml.
FROM mcr.microsoft.com/playwright:v1.65.1-jammy

ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    NODE_ENV=production

RUN corepack enable && corepack prepare pnpm@9.15.9 --activate

WORKDIR /app

# Workspace manifests first so dependency layers cache independently of source.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN pnpm install --frozen-lockfile --filter backend...

COPY packages packages
COPY backend backend
RUN pnpm --filter backend build

EXPOSE 4000

# Compiled output: no tsx, no dev dependencies at runtime.
CMD ["node", "backend/dist/index.js"]
