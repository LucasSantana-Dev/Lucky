# syntax=docker/dockerfile:1
# Multi-stage Dockerfile for LukBot services
# Usage: docker build --build-arg SERVICE=bot --build-arg NODE_ENV=production -t lukbot-bot .
#        docker build --build-arg SERVICE=backend --build-arg NODE_ENV=production -t lukbot-backend .
#        docker build --build-arg SERVICE=dev -t lukbot-dev .

ARG NODE_VERSION=22-alpine
ARG SERVICE=bot
ARG NODE_ENV=production

# Base runtime stage - minimal dependencies for production
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

# Base build stage - adds build tools for compilation
FROM base-runtime AS base-build

RUN apk add --no-cache \
    git \
    opus-dev \
    build-base \
    python3-dev \
    && rm -rf /var/cache/apk/*

# Production dependencies stage
FROM base-runtime AS deps-production

COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY packages/${SERVICE}/package*.json ./packages/${SERVICE}/

RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --no-audit --no-fund && \
    npm cache clean --force

# Build dependencies stage - includes dev dependencies for building
FROM base-build AS deps-build

COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY packages/${SERVICE}/package*.json ./packages/${SERVICE}/

RUN --mount=type=cache,target=/root/.npm \
    npm ci --no-audit --no-fund && \
    npm cache clean --force

# Build stage
FROM deps-build AS build

COPY packages/shared ./packages/shared
COPY packages/${SERVICE} ./packages/${SERVICE}
COPY prisma ./prisma

WORKDIR /app/packages/shared
RUN npm run build

WORKDIR /app/packages/${SERVICE}
RUN npm run build

# Production stage - minimal runtime image
FROM base-runtime AS production

ARG SERVICE
ARG NODE_ENV

ENV NODE_ENV=${NODE_ENV} \
    NPM_CONFIG_LOGLEVEL=silent

WORKDIR /app

COPY --from=deps-production /app/package*.json ./
COPY --from=deps-production /app/node_modules ./node_modules
COPY --from=deps-production /app/packages/shared/package*.json ./packages/shared/
COPY --from=deps-production /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps-production /app/packages/${SERVICE}/package*.json ./packages/${SERVICE}/
COPY --from=deps-production /app/packages/${SERVICE}/node_modules ./packages/${SERVICE}/node_modules
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/${SERVICE}/dist ./packages/${SERVICE}/dist
COPY --from=build /app/prisma ./prisma

RUN if [ "$SERVICE" = "bot" ]; then \
        mkdir -p downloads logs && \
        addgroup -g 1001 -S nodejs && \
        adduser -S bot -u 1001 -G nodejs && \
        chown -R bot:nodejs /app && \
        chmod -R 755 /app/downloads; \
    elif [ "$SERVICE" = "backend" ]; then \
        addgroup -g 1001 -S nodejs && \
        adduser -S backend -u 1001 -G nodejs && \
        chown -R backend:nodejs /app; \
    fi

USER ${SERVICE}

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "console.log('Service is running')" || exit 1

CMD ["sh", "-c", "if [ \"$SERVICE\" = \"bot\" ]; then node packages/bot/dist/index.js; else node packages/backend/dist/index.js; fi"]

# Development stage
FROM deps-build AS development

ARG SERVICE

ENV NODE_ENV=development \
    NPM_CONFIG_LOGLEVEL=warn

WORKDIR /app

COPY . .

RUN mkdir -p downloads logs && \
    chmod +x scripts/discord-bot.sh 2>/dev/null || true

RUN addgroup -g 1001 -S nodejs && \
    adduser -S bot -u 1001 -G nodejs && \
    chown -R bot:nodejs /app

USER bot

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "console.log('Bot is running')" || exit 1

CMD ["sh", "-c", "if [ \"$SERVICE\" = \"bot\" ]; then npm run dev:bot; else npm run dev:backend; fi"]
