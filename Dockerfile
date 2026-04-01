# syntax=docker/dockerfile:1
# Multi-stage Dockerfile for Lucky services
# Usage: docker compose --env-file .env.production up -d --build

ARG NODE_VERSION=22-alpine

FROM node:${NODE_VERSION} AS base-runtime

RUN apk add --no-cache \
    python3 \
    py3-pip \
    ffmpeg \
    opus \
    opus-tools \
    && rm -rf /var/cache/apk/*

RUN pip3 install --break-system-packages --no-cache-dir yt-dlp

WORKDIR /app

FROM node:${NODE_VERSION} AS base-runtime-backend
WORKDIR /app

# Build stage — installs all deps, generates prisma, builds shared + target
FROM node:${NODE_VERSION} AS build

RUN apk add --no-cache git build-base python3 python3-dev opus-dev && rm -rf /var/cache/apk/*

WORKDIR /app

COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY packages/bot/package*.json ./packages/bot/
COPY packages/backend/package*.json ./packages/backend/
COPY packages/frontend/package*.json ./packages/frontend/

RUN --mount=type=cache,id=npm-build-stage,target=/root/.npm,sharing=locked \
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

# Production deps — slim install (no dev deps)
FROM node:${NODE_VERSION} AS deps-production

RUN apk add --no-cache python3 && rm -rf /var/cache/apk/*

WORKDIR /app

COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY packages/bot/package*.json ./packages/bot/
COPY packages/backend/package*.json ./packages/backend/
COPY packages/frontend/package*.json ./packages/frontend/

RUN --mount=type=cache,id=npm-deps-production,target=/root/.npm,sharing=locked \
    YOUTUBE_DL_SKIP_DOWNLOAD=1 \
    YOUTUBE_DL_SKIP_PYTHON_CHECK=1 \
    npm ci --legacy-peer-deps --omit=dev --no-audit --no-fund && \
    (npm cache verify 2>/dev/null || true)

# Production stage — bot (full runtime with ffmpeg/opus/yt-dlp)
FROM base-runtime AS production-bot

ENV NODE_ENV=production \
    NPM_CONFIG_LOGLEVEL=silent

WORKDIR /app

COPY --from=deps-production /app/node_modules ./node_modules
COPY --from=deps-production /app/package*.json ./
COPY --from=deps-production /app/packages/shared/package*.json ./packages/shared/
COPY --from=deps-production /app/packages/bot/package*.json ./packages/bot/
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/src/generated ./packages/shared/src/generated
COPY --from=build /app/packages/shared/src/generated ./packages/shared/dist/generated
COPY --from=build /app/packages/bot/dist ./packages/bot/dist
COPY --from=build /app/prisma ./prisma

RUN mkdir -p downloads logs && \
    addgroup -g 1001 -S nodejs && \
    adduser -S bot -u 1001 -G nodejs && \
    chown -R bot:nodejs /app && \
    chmod -R 755 /app/downloads

USER bot

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "console.log('Service is running')" || exit 1

CMD ["sh", "-c", "npx prisma migrate deploy && node packages/bot/dist/index.js"]

# Production stage — backend (slim runtime, no media tools)
FROM base-runtime-backend AS production-backend

ARG COMMIT_SHA
ENV NODE_ENV=production \
    NPM_CONFIG_LOGLEVEL=silent \
    COMMIT_SHA=$COMMIT_SHA

WORKDIR /app

COPY --from=deps-production /app/node_modules ./node_modules
COPY --from=deps-production /app/package*.json ./
COPY --from=deps-production /app/packages/shared/package*.json ./packages/shared/
COPY --from=deps-production /app/packages/backend/package*.json ./packages/backend/
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/src/generated ./packages/shared/src/generated
COPY --from=build /app/packages/shared/src/generated ./packages/shared/dist/generated
COPY --from=build /app/packages/backend/dist ./packages/backend/dist
COPY --from=build /app/prisma ./prisma

RUN addgroup -g 1001 -S nodejs && \
    adduser -S backend -u 1001 -G nodejs && \
    chown -R backend:nodejs /app

USER backend

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://127.0.0.1:3000/api/toggles/global', r => process.exit(r.statusCode < 500 ? 0 : 1)).on('error', () => process.exit(1))" || exit 1

CMD ["node", "packages/backend/dist/index.js"]
