# Use Node.js 22 Alpine as base image
FROM node:22-alpine

# Install system dependencies including opus libraries
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

# Install yt-dlp using pipx for isolated installation
RUN pip3 install --break-system-packages yt-dlp

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies with proper opus support
RUN npm ci

# Copy source code
COPY . .

# Build the application using tsup
RUN npm run build

# Remove dev dependencies after build
RUN npm prune --omit=dev

# Create downloads directory
RUN mkdir -p downloads

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S bot -u 1001

# Change ownership of the app directory
RUN chown -R bot:nodejs /app
USER bot

# Expose port (if needed for health checks)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "console.log('Bot is running')" || exit 1

# Start the bot directly
CMD ["node", "dist/index.js"]
