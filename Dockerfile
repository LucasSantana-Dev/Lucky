# syntax=docker/dockerfile:1
# Multi-stage Dockerfile for Nexus services
# Usage: docker build --target production-bot -t nexus-bot .
#        docker build --target production-backend -t nexus-backend .

ARG NODE_VERSION=22-alpine
ARG SERVICE=bot
ARG NODE_ENV=production

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

# Base build stage - adds build tools for compilation
FROM base-runtime AS base-build

RUN apk add --no-cache \
    git \
    opus-dev \
    build-base \
    python3-dev \
    && rm -rf /var/cache/apk/*

# Build dependencies stage - includes dev dependencies for building
FROM base-build AS deps-build

ARG SERVICE

COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY packages/${SERVICE}/package*.json ./packages/${SERVICE}/

RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund && \
    npm cache clean --force

# Build stage
FROM deps-build AS build

ARG SERVICE

COPY packages/shared ./packages/shared
COPY packages/${SERVICE} ./packages/${SERVICE}
COPY prisma ./prisma

WORKDIR /app
RUN npx prisma generate

WORKDIR /app/packages/shared
RUN npm run build

WORKDIR /app/packages/${SERVICE}
RUN npm run build

# Production dependencies stage
FROM base-runtime AS deps-production-bot

COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY packages/bot/package*.json ./packages/bot/

RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --no-audit --no-fund && \
    npm cache clean --force

FROM base-runtime-backend AS deps-production-backend

COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY packages/backend/package*.json ./packages/backend/

RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --no-audit --no-fund && \
    npm cache clean --force

# Production stage - bot (full runtime with ffmpeg/opus/yt-dlp)
FROM base-runtime AS production-bot

ARG NODE_ENV

ENV NODE_ENV=${NODE_ENV} \
    NPM_CONFIG_LOGLEVEL=silent

WORKDIR /app

COPY --from=deps-production-bot /app/package*.json ./
COPY --from=deps-production-bot /app/node_modules ./node_modules
COPY --from=deps-production-bot /app/packages/shared/package*.json ./packages/shared/
COPY --from=deps-production-bot /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps-production-bot /app/packages/bot/package*.json ./packages/bot/
COPY --from=deps-production-bot /app/packages/bot/node_modules ./packages/bot/node_modules
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/src/generated ./packages/shared/src/generated
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

CMD ["node", "packages/bot/dist/index.js"]

# Production stage - backend (slim runtime, no media tools)
FROM base-runtime-backend AS production-backend

ARG NODE_ENV

ENV NODE_ENV=${NODE_ENV} \
    NPM_CONFIG_LOGLEVEL=silent

WORKDIR /app

COPY --from=deps-production-backend /app/package*.json ./
COPY --from=deps-production-backend /app/node_modules ./node_modules
COPY --from=deps-production-backend /app/packages/shared/package*.json ./packages/shared/
COPY --from=deps-production-backend /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps-production-backend /app/packages/backend/package*.json ./packages/backend/
COPY --from=deps-production-backend /app/packages/backend/node_modules ./packages/backend/node_modules
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/src/generated ./packages/shared/src/generated
COPY --from=build /app/packages/backend/dist ./packages/backend/dist
COPY --from=build /app/prisma ./prisma

RUN addgroup -g 1001 -S nodejs && \
    adduser -S backend -u 1001 -G nodejs && \
    chown -R backend:nodejs /app

USER backend

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://127.0.0.1:3000/', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))" || exit 1

CMD ["node", "packages/backend/dist/index.js"]
