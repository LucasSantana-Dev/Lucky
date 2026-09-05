# syntax=docker/dockerfile:1
# Multi-stage Dockerfile for Lucky services
# Usage: docker compose --env-file .env.production up -d --build
#
# CI (.github/actions/docker-build-service, .github/workflows/docker-publish.yml)
# runs this with BuildKit's max-parallelism=1 — the "failed to calculate
# checksum of ref ...: not found" errors documented throughout this file
# turned out to be a BuildKit solver-level race under its default
# concurrent stage scheduling, not caching or job-level concurrency
# (issue #2015). A plain `docker buildx build` (default concurrent
# scheduler) is how to reproduce it locally; max-parallelism=1 is what
# suppresses it, not what causes it.

# Node 24 = Active LTS (since Oct 2025). @discordjs/opus ships no prebuilt for
# this ABI, so it source-compiles via the toolchain the build/deps stages carry
# (build-base python3-dev opus-dev). Verified on linux/amd64 — the arch CI builds
# and the homelab runs. NOTE: opus 0.10.0's bundled NEON code fails to compile on
# linux/arm64 (musl) regardless of Node version (already broken on Node 22) — see
# issue #1406; Apple-Silicon local dev should run the bot natively rather than
# via the Docker dev stage.
# Digest-pinned (tag kept for readability) — a floating `node:24-alpine` tag
# can be repointed to a new image mid-CI, which produced intermittent
# `failed to calculate checksum of ref ...: not found` errors on the
# deps-production COPY steps (a stage built against one digest, referenced
# against another). Bump the digest deliberately when moving to a new Node
# patch, not implicitly via upstream republish.
ARG NODE_VERSION=24-alpine@sha256:e67514e5d0f6c46656005e1b693b2ec9d52e80b641307de684d4a015ba7a4eaf
# Lockfile-hash cache key — auto-busts npm BuildKit caches when package-lock.json
# changes. Passed as a build-arg from the workflow: hashFiles('package-lock.json').
# Bump the default (v3 → v4) only if you need a forced one-off cache wipe.
ARG NPM_CACHE_KEY=v4

FROM node:${NODE_VERSION} AS base-runtime

# yt-dlp is installed into a dedicated venv at /opt/ytdlp so we avoid
# `--break-system-packages` (Alpine's PEP 668 marker). The venv binary
# is symlinked into /usr/local/bin so callers don't need to know the path.
# libexpat is pulled in as a python3 dependency; upgrade only that package
# to the current index to close CVE-2026-76641 / CVE-2026-66046
# (libexpat < 2.8.4-r0) without floating the rest of the digest-pinned base.
RUN apk add --no-cache \
    python3 \
    py3-pip \
    ffmpeg \
    opus \
    opus-tools \
    && apk upgrade --no-cache libexpat \
    && python3 -m venv /opt/ytdlp \
    && /opt/ytdlp/bin/pip install --no-cache-dir --upgrade pip yt-dlp \
    && ln -s /opt/ytdlp/bin/yt-dlp /usr/local/bin/yt-dlp \
    && rm -rf /var/cache/apk/* /root/.cache \
    && npm install -g npm@latest \
    && npm cache clean --force

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

# Build stage — installs all deps. Prisma generation and the per-workspace
# builds happen in the stages below (source-copied, build-shared, build-bot,
# build-backend, build-frontend), split apart to avoid coupling unrelated
# COPY --from steps to each other's build RUNs — see the comments there.
FROM node:${NODE_VERSION} AS build
ARG NPM_CACHE_KEY

RUN apk add --no-cache git build-base python3 python3-dev opus-dev && rm -rf /var/cache/apk/* && npm install -g npm@latest && npm cache clean --force

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

# Checkpoint right after npm ci, before any source COPY or per-workspace
# build runs: every workspace's node_modules is fully installed and final
# here. deps-production-* copies node_modules from this stage instead of a
# later one — `COPY --from=<stage>` always waits for that stage's LAST
# instruction, and a RUN further down that stage's chain intermittently
# corrupted BuildKit's cache-key resolution for an earlier-ready path COPY'd
# from the same stage ("failed to calculate checksum of ref ...: not found"
# immediately after that RUN completed — reproduced consistently across
# buildx versions, with/without the GHA cache, concurrent and alone; never
# root-caused beyond decoupling the two). None of the per-workspace build
# scripts write into node_modules, so this is a behavior-neutral extraction
# point, not a functional change.
#
# This has to be its own empty stage, not just a label slapped on `build`:
# every instruction between a `FROM ... AS x` and the next `FROM` belongs to
# x's own chain, so if source gets COPY'd and workspaces get built before the
# next FROM, "installed-deps" would still end at the last of those
# instructions — no earlier checkpoint at all, just a rename.
FROM build AS installed-deps

# Same bug, same fix, one level further in: shared/dist, shared/src/generated,
# and the prisma directory are all COPY'd into the production images from
# whichever stage last touched them. Building bot/backend/frontend
# sequentially in one stage means each of their `RUN npm run build` steps
# becomes the "last instruction" that a COPY --from of the earlier-ready
# shared/prisma output has to wait on too, even though that output has
# nothing to do with the later builds. Splitting bot/backend/frontend into
# their own stages branching off build-shared removes that coupling (and
# lets them build in parallel, since none of the three depends on the
# others' output).
FROM installed-deps AS source-copied
COPY packages/shared ./packages/shared
COPY packages/bot ./packages/bot
COPY packages/backend ./packages/backend
COPY prisma ./prisma
RUN npx prisma generate

FROM source-copied AS build-shared
WORKDIR /app
RUN npm run build:shared

FROM build-shared AS build-bot
RUN npm run build --workspace=packages/bot

FROM build-shared AS build-backend
RUN npm run build --workspace=packages/backend

# Frontend build — inherits build-shared's deps + toolchain, so we get
# build-base + python3-dev + opus-dev "for free." Previously the standalone
# Dockerfile.frontend re-ran `npm ci` for ~all workspace deps (including
# @discordjs/opus) but lacked the C toolchain, which broke node:26-alpine
# in PR #846. Sharing the build stage eliminates that class of failure.
# Must branch from build-shared, not installed-deps: frontend imports
# @lucky/shared/constants, which only resolves once shared's dist output
# exists.
FROM build-shared AS build-frontend
COPY packages/frontend ./packages/frontend
# Frontend's /changelog page imports the repo-root CHANGELOG.md via
# `import md from '../../../../CHANGELOG.md?raw'` (vite raw loader). The
# build context's project root is /app, so the file must be present there.
COPY CHANGELOG.md ./CHANGELOG.md
RUN npm run build --workspace=packages/frontend

# Production deps — slim install (no dev deps). Split per production target
# (deps-production-bot / deps-production-backend) rather than one shared stage
# copying all four packages' node_modules: production-bot only ever consumes
# root+shared+bot below, production-backend only root+shared+backend, and
# production-frontend doesn't use this stage at all (static build from
# build-frontend). The old single-stage version copied packages/backend's and
# packages/frontend's node_modules into every target unconditionally, which
# was pure waste and also the exact COPY --from step BuildKit intermittently
# failed to resolve with "failed to calculate checksum of ref ...: not found"
# on this repo's CI runners (reproduced across buildx v0.35.0/v0.36.1, with
# and without the GHA cache, alone and concurrent, disk headroom confirmed
# fine every time — never root-caused beyond "eliminate the unneeded COPY").
FROM node:${NODE_VERSION} AS deps-production-base
ARG NPM_CACHE_KEY

# build-base + python3-dev + opus-dev: @discordjs/opus falls back to a source
# build whenever its musl prebuilt is missing for the current base image
# (alpine/musl bumps rename the prebuilt — 404'd 2026-06-12, #1309). Same
# toolchain the build stage carries (L50) and the same failure class the
# frontend stage comment below documents from PR #846.
RUN apk add --no-cache build-base python3 python3-dev opus-dev && rm -rf /var/cache/apk/* && npm install -g npm@latest && npm cache clean --force

WORKDIR /app

# All four package.json files stay copied (not just the target's own) so npm
# workspace resolution below sees the same workspace graph as the original
# single-stage version — only which node_modules directories get copied (and
# therefore pruned/shipped) actually differs per target.
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY packages/bot/package*.json ./packages/bot/
COPY packages/backend/package*.json ./packages/backend/
COPY packages/frontend/package*.json ./packages/frontend/

# Independent npm ci instead of COPY --from=installed-deps (issue #2015).
# installed-deps is concurrently extended by a second live branch
# (source-copied, via FROM inheritance) for the whole rest of this build —
# COPY --from of it while that's happening hit a BuildKit race ("failed to
# calculate checksum of ref ...: not found"), non-deterministically but at
# a very high rate on GH Actions runners, and never resolved by cache
# tuning or retries alone (#2002, #2013, #2016). Running npm ci here
# duplicates the @discordjs/opus native compile once — this stage is
# shared by both deps-production-bot and deps-production-backend below, so
# it's a one-time cost per build, not per target — but fully decouples this
# lineage from installed-deps: no more cross-stage read of a stage still
# being written to elsewhere.
RUN --mount=type=cache,id=npm-build-stage-v4-${NPM_CACHE_KEY},target=/root/.npm,sharing=locked \
    YOUTUBE_DL_SKIP_DOWNLOAD=1 \
    npm ci --legacy-peer-deps --no-audit --no-fund

FROM deps-production-base AS deps-production-bot
RUN npm prune --omit=dev --legacy-peer-deps
# Same guard as deps-production-backend below: nested workspace node_modules
# can hoist away between installs and COPY --from hard-fails on a missing dir.
RUN mkdir -p packages/shared/node_modules packages/bot/node_modules

FROM deps-production-base AS deps-production-backend
RUN npm prune --omit=dev --legacy-peer-deps
# Whether npm nests any deps under packages/backend/node_modules (vs fully
# hoisting to root) depends on the lockfile resolution and can flip between
# installs with no source change (e.g. deepmerge-ts override regen dropped
# it to zero). COPY --from of a nonexistent dir hard-fails the build, so
# guarantee the dir exists — empty is harmless, real nested deps still copy.
RUN mkdir -p packages/backend/node_modules packages/shared/node_modules

# Production stage — bot (full runtime with ffmpeg/opus/yt-dlp)
FROM base-runtime AS production-bot

ARG COMMIT_SHA
ENV NODE_ENV=production \
    NPM_CONFIG_LOGLEVEL=silent \
    COMMIT_SHA=$COMMIT_SHA

WORKDIR /app

COPY --from=deps-production-bot /app/node_modules ./node_modules
COPY --from=deps-production-bot /app/package*.json ./
COPY --from=deps-production-bot /app/packages/shared/package*.json ./packages/shared/
COPY --from=deps-production-bot /app/packages/bot/package*.json ./packages/bot/
COPY --from=deps-production-bot /app/packages/bot/node_modules ./packages/bot/node_modules
# packages/shared's own node_modules. npm nests a dep here instead of hoisting
# it whenever another workspace pins a conflicting range (packages/frontend also
# depends on axios, so both copies nested). shared/dist imports these at
# runtime, so omitting this directory kills the container with
# ERR_MODULE_NOT_FOUND. 9 packages are nested here as of this commit, which is
# why this copies the whole directory rather than naming one dep. It comes from
# deps-production-bot, so it is already devDep-pruned.
COPY --from=deps-production-bot /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=build-shared /app/packages/shared/dist ./packages/shared/dist
COPY --from=source-copied /app/packages/shared/src/generated ./packages/shared/src/generated
COPY --from=source-copied /app/packages/shared/src/generated ./packages/shared/dist/generated
COPY --from=build-bot /app/packages/bot/dist ./packages/bot/dist
COPY --from=source-copied /app/prisma ./prisma
# Bake the Prisma engines. `prisma`/`@prisma/engines` are devDeps, so the
# deps-production-bot `npm ci --omit=dev` above ships node_modules WITHOUT the
# migrate schema-engine — `prisma migrate deploy` then tries to download it at
# boot (fails for uid 1001 on a root-owned dir; needs the CDN reachable). The
# build stage's full `npm ci` already has the engines, so copy them in: no
# runtime download, no boot-time Prisma-CDN dependency. (#1734)
COPY --from=source-copied /app/node_modules/@prisma ./node_modules/@prisma

RUN mkdir -p downloads logs && \
    addgroup -g 1001 -S nodejs && \
    adduser -S bot -u 1001 -G nodejs && \
    chown -R bot:nodejs /app/downloads /app/logs /app/node_modules/@prisma && \
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

COPY --from=deps-production-backend /app/node_modules ./node_modules
COPY --from=deps-production-backend /app/package*.json ./
COPY --from=deps-production-backend /app/packages/shared/package*.json ./packages/shared/
COPY --from=deps-production-backend /app/packages/backend/package*.json ./packages/backend/
COPY --from=deps-production-backend /app/packages/backend/node_modules ./packages/backend/node_modules
# packages/shared's own node_modules. npm nests a dep here instead of hoisting
# it whenever another workspace pins a conflicting range (packages/frontend also
# depends on axios, so both copies nested). shared/dist imports these at
# runtime, so omitting this directory kills the container with
# ERR_MODULE_NOT_FOUND. 9 packages are nested here as of this commit, which is
# why this copies the whole directory rather than naming one dep. It comes from
# deps-production-backend, so it is already devDep-pruned.
COPY --from=deps-production-backend /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=build-shared /app/packages/shared/dist ./packages/shared/dist
COPY --from=source-copied /app/packages/shared/src/generated ./packages/shared/src/generated
COPY --from=source-copied /app/packages/shared/src/generated ./packages/shared/dist/generated
COPY --from=build-backend /app/packages/backend/dist ./packages/backend/dist
COPY --from=source-copied /app/prisma ./prisma
# prisma/@prisma/engines are devDeps, so deps-production-backend's `npm ci --omit=dev`
# ships node_modules WITHOUT the migrate schema-engine — `prisma migrate deploy`
# (run via this backend image, see scripts/deploy.sh) then fails to write the
# engine binary as the non-root `backend` user. The bot stage above already
# works around this by copying the build stage's full @prisma from ./node_modules
# (#1734/#1735); backend needs the same copy + chown, it just never got it.
COPY --from=source-copied /app/node_modules/@prisma ./node_modules/@prisma

RUN addgroup -g 1001 -S nodejs && \
    adduser -S backend -u 1001 -G nodejs && \
    chown -R backend:nodejs /app/packages/backend/dist /app/prisma /app/node_modules/@prisma

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
