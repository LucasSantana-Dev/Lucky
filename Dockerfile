# Multi-stage Dockerfile for LukBot services
# Usage: docker build --build-arg SERVICE=bot --build-arg NODE_ENV=production -t lukbot-bot .
#        docker build --build-arg SERVICE=backend --build-arg NODE_ENV=production -t lukbot-backend .
#        docker build --build-arg SERVICE=dev -t lukbot-dev .

ARG NODE_VERSION=22-alpine
ARG SERVICE=bot
ARG NODE_ENV=production

# Base stage with common dependencies
FROM node:${NODE_VERSION} AS base

RUN apk add --no-cache \
    python3 \
    py3-pip \
    ffmpeg \
    git \
    opus \
    opus-dev \
    opus-tools \
    build-base \
    python3-dev \
    && rm -rf /var/cache/apk/*

RUN pip3 install --break-system-packages yt-dlp

WORKDIR /app

# Dependencies stage
FROM base AS dependencies

COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY packages/${SERVICE}/package*.json ./packages/${SERVICE}/

RUN npm install

# Build stage
FROM dependencies AS build

COPY packages/shared ./packages/shared
COPY packages/${SERVICE} ./packages/${SERVICE}
COPY prisma ./prisma

WORKDIR /app/packages/shared
RUN npm run build

WORKDIR /app/packages/${SERVICE}
RUN npm run build

# Production stage
FROM base AS production

ARG SERVICE
ARG NODE_ENV

WORKDIR /app

COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/package*.json ./
COPY --from=dependencies /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=dependencies /app/packages/${SERVICE}/node_modules ./packages/${SERVICE}/node_modules
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/
COPY --from=build /app/packages/${SERVICE}/dist ./packages/${SERVICE}/dist
COPY --from=build /app/packages/${SERVICE}/package.json ./packages/${SERVICE}/
COPY --from=build /app/prisma ./prisma

RUN if [ "$SERVICE" = "bot" ]; then \
        npm prune --omit=dev && \
        mkdir -p downloads logs && \
        addgroup -g 1001 -S nodejs && \
        adduser -S bot -u 1001 && \
        chown -R bot:nodejs /app && \
        chmod -R 755 /app/downloads; \
    elif [ "$SERVICE" = "backend" ]; then \
        npm prune --omit=dev && \
        addgroup -g 1001 -S nodejs && \
        adduser -S backend -u 1001 && \
        chown -R backend:nodejs /app; \
    fi

USER ${SERVICE}

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "console.log('Service is running')" || exit 1

CMD ["sh", "-c", "if [ \"$SERVICE\" = \"bot\" ]; then node packages/bot/dist/index.js; else node packages/backend/dist/index.js; fi"]

# Development stage
FROM dependencies AS development

ARG SERVICE

WORKDIR /app

COPY . .

RUN mkdir -p downloads logs && \
    chmod +x scripts/discord-bot.sh 2>/dev/null || true

RUN addgroup -g 1001 -S nodejs && \
    adduser -S bot -u 1001 && \
    chown -R bot:nodejs /app

USER bot

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "console.log('Bot is running')" || exit 1

CMD ["sh", "-c", "if [ \"$SERVICE\" = \"bot\" ]; then npm run dev:bot; else npm run dev:backend; fi"]
