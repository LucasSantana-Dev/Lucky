# syntax=docker/dockerfile:1
# Multi-stage Dockerfile for Lucky services
# Usage: docker compose --env-file .env.production up -d --build

# Node 24 = Active LTS (since Oct 2025). @discordjs/opus ships no prebuilt for
# this ABI, so it source-compiles via the toolchain the build/deps stages carry
# (build-base python3-dev opus-dev). Verified on linux/amd64 — the arch CI builds
# and the homelab runs. NOTE: opus 0.10.0's bundled NEON code fails to compile on
# linux/arm64 (musl) regardless of Node version (already broken on Node 22) — see
# issue #1406; Apple-Silicon local dev should run the bot natively rather than
# via the Docker dev stage.
ARG NODE_VERSION=24-alpine
# Lockfile-hash cache key — auto-busts npm BuildKit caches when package-lock.json
# changes. Passed as a build-arg from the workflow: hashFiles('package-lock.json').
# Bump the default (v3 → v4) only if you need a forced one-off cache wipe.
ARG NPM_CACHE_KEY=v4

FROM node:${NODE_VERSION} AS base-runtime

# yt-dlp is installed into a dedicated venv at /opt/ytdlp so we avoid
# `--break-system-packages` (Alpine's PEP 668 marker). The venv binary
# is symlinked into /usr/local/bin so callers don't need to know the path.
RUN apk add --no-cache \
    python3 \
    py3-pip \
    ffmpeg \
    opus \
    opus-tools \
    && python3 -m venv /opt/ytdlp \
    && /opt/ytdlp/bin/pip install --no-cache-dir --upgrade pip yt-dlp \
    && ln -s /opt/ytdlp/bin/yt-dlp /usr/local/bin/yt-dlp \
    && rm -rf /var/cache/apk/* /root/.cache \
    && npm install -g npm@latest

WORKDIR /app

# Development stage — full deps + native build tools + media binaries.
# Source is bind-mounted by docker-compose.dev.yml (`.:/app`), so this
# image only needs the runtime + global tooling. node_modules is preserved
# inside the container via an anonymous volume.
FROM base-runtime AS development
RUN apk add --no-cache git build-base python3-dev opus-dev && rm -rf /var/cache/apk/*
WORKDIR /app
ENV NODE_ENV=development \
    NPM_CONFIG_LOGLEVEL=warn
# Compose mounts host source over /app; node_modules is installed at first
# run via the entrypoint to populate the anonymous volume. Dev stage runs as
# root because the bind-mounted host source needs write access matching the
# host user's UID and `npm ci` writes the anonymous volume's node_modules.
# Production stages below all set a non-root USER.
# nosemgrep: dockerfile.security.missing-user.missing-user
CMD ["sh", "-c", "npm ci --legacy-peer-deps --no-audit --no-fund && npx prisma generate && npm run dev --workspace=packages/bot"]

# Build stage — installs all deps, generates prisma, builds shared + target
FROM node:${NODE_VERSION} AS build
ARG NPM_CACHE_KEY

RUN apk add --no-cache git build-base python3 python3-dev opus-dev && rm -rf /var/cache/apk/* && npm install -g npm@latest

WORKDIR /app

COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY packages/bot/package*.json ./packages/bot/
COPY packages/backend/package*.json ./packages/backend/
COPY packages/frontend/package*.json ./packages/frontend/

RUN --mount=type=cache,id=npm-build-stage-v4-${NPM_CACHE_KEY},target=/root/.npm,sharing=locked \
    YOUTUBE_DL_SKIP_DOWNLOAD=1 \
    npm ci --legacy-peer-deps --no-audit --no-fund && \
    (npm cache verify 2>/dev/null || true)

COPY packages/shared ./packages/shared
COPY packages/bot ./packages/bot
COPY packages/backend ./packages/backend
COPY prisma ./prisma

RUN npx prisma generate

WORKDIR /app
RUN npm run build:shared
RUN npm run build --workspace=packages/bot
RUN npm run build --workspace=packages/backend

# Frontend build — inherits the build stage's deps + toolchain, so we get
# build-base + python3-dev + opus-dev "for free." Previously the standalone
# Dockerfile.frontend re-ran `npm ci` for ~all workspace deps (including
# @discordjs/opus) but lacked the C toolchain, which broke node:26-alpine
# in PR #846. Sharing the build stage eliminates that class of failure.
FROM build AS build-frontend
COPY packages/frontend ./packages/frontend
# Frontend's /changelog page imports the repo-root CHANGELOG.md via
# `import md from '../../../../CHANGELOG.md?raw'` (vite raw loader). The
# build context's project root is /app, so the file must be present there.
COPY CHANGELOG.md ./CHANGELOG.md
RUN npm run build --workspace=packages/frontend

# Production deps — slim install (no dev deps)
FROM node:${NODE_VERSION} AS deps-production
ARG NPM_CACHE_KEY

# build-base + python3-dev + opus-dev: @discordjs/opus falls back to a source
# build whenever its musl prebuilt is missing for the current base image
# (alpine/musl bumps rename the prebuilt — 404'd 2026-06-12, #1309). Same
# toolchain the build stage carries (L50) and the same failure class the
# frontend stage comment below documents from PR #846.
RUN apk add --no-cache build-base python3 python3-dev opus-dev && rm -rf /var/cache/apk/* && npm install -g npm@latest

WORKDIR /app

COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY packages/bot/package*.json ./packages/bot/
COPY packages/backend/package*.json ./packages/backend/
COPY packages/frontend/package*.json ./packages/frontend/

RUN --mount=type=cache,id=npm-deps-production-v4-${NPM_CACHE_KEY},target=/root/.npm,sharing=locked \
    YOUTUBE_DL_SKIP_DOWNLOAD=1 \
    YOUTUBE_DL_SKIP_PYTHON_CHECK=1 \
    npm ci --legacy-peer-deps --omit=dev --no-audit --no-fund && \
    (npm cache verify 2>/dev/null || true)

# Production stage — bot (full runtime with ffmpeg/opus/yt-dlp)
FROM base-runtime AS production-bot

ARG COMMIT_SHA
ENV NODE_ENV=production \
    NPM_CONFIG_LOGLEVEL=silent \
    COMMIT_SHA=$COMMIT_SHA

WORKDIR /app

COPY --from=deps-production /app/node_modules ./node_modules
COPY --from=deps-production /app/package*.json ./
COPY --from=deps-production /app/packages/shared/package*.json ./packages/shared/
COPY --from=deps-production /app/packages/bot/package*.json ./packages/bot/
COPY --from=deps-production /app/packages/bot/node_modules ./packages/bot/node_modules
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/src/generated ./packages/shared/src/generated
COPY --from=build /app/packages/shared/src/generated ./packages/shared/dist/generated
COPY --from=build /app/packages/bot/dist ./packages/bot/dist
COPY --from=build /app/prisma ./prisma

RUN mkdir -p downloads logs && \
    addgroup -g 1001 -S nodejs && \
    adduser -S bot -u 1001 -G nodejs && \
    chown -R bot:nodejs /app/downloads /app/logs && \
    chmod -R 755 /app/downloads

USER bot

# Gateway readiness via /healthz — returns 200 when client.isReady(), 503 otherwise.
# Covers Redis reachability implicitly (the bot cannot complete login without it).
HEALTHCHECK --interval=15s --timeout=5s --start-period=45s --retries=3 \
    CMD node -e "require('http').get('http://127.0.0.1:9091/healthz',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["sh", "-c", "npx prisma migrate deploy --config prisma/prisma.config.ts && node packages/bot/dist/index.js"]

# Production stage — backend (slim runtime, no media tools).
# Derives directly from node:${NODE_VERSION} instead of a no-op intermediate
# `base-runtime-backend` stage.
FROM node:${NODE_VERSION} AS production-backend
WORKDIR /app

ARG COMMIT_SHA
ENV NODE_ENV=production \
    NPM_CONFIG_LOGLEVEL=silent \
    COMMIT_SHA=$COMMIT_SHA

COPY --from=deps-production /app/node_modules ./node_modules
COPY --from=deps-production /app/package*.json ./
COPY --from=deps-production /app/packages/shared/package*.json ./packages/shared/
COPY --from=deps-production /app/packages/backend/package*.json ./packages/backend/
COPY --from=deps-production /app/packages/backend/node_modules ./packages/backend/node_modules
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/src/generated ./packages/shared/src/generated
COPY --from=build /app/packages/shared/src/generated ./packages/shared/dist/generated
COPY --from=build /app/packages/backend/dist ./packages/backend/dist
COPY --from=build /app/prisma ./prisma

RUN addgroup -g 1001 -S nodejs && \
    adduser -S backend -u 1001 -G nodejs && \
    chown -R backend:nodejs /app/packages/backend/dist /app/prisma

USER backend

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://127.0.0.1:3000/api/toggles/global', r => process.exit(r.statusCode < 500 ? 0 : 1)).on('error', () => process.exit(1))" || exit 1

CMD ["node", "packages/backend/dist/index.js"]

# Production stage — frontend (static SPA served by non-root nginx).
# Replaces the former standalone Dockerfile.frontend.
FROM nginxinc/nginx-unprivileged:1.31-alpine AS production-frontend

# Patch Alpine OS packages to current Alpine 3.21 package index versions.
# See Dockerfile.nginx for context (same base image, same CVE exposure).
USER root
RUN apk upgrade --no-cache && rm -rf /var/cache/apk/*
USER nginx

COPY --from=build-frontend /app/packages/frontend/dist /usr/share/nginx/html
COPY nginx/frontend.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080

# nginx-unprivileged is alpine/busybox: its `sh` (ash) has no /dev/tcp (a bash
# builtin), so the previous probe could never run -> false-positive "unhealthy".
# busybox wget is present and reaches the unprivileged :8080 listener.
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD wget -q --spider http://127.0.0.1:8080/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
