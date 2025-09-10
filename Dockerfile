# Use Node.js 22 Alpine as base image
FROM node:22-alpine

# Install system dependencies
RUN apk add --no-cache \
    python3 \
    py3-pip \
    ffmpeg \
    git \
    && rm -rf /var/cache/apk/*

# Install yt-dlp using pipx for isolated installation
RUN pip3 install --break-system-packages yt-dlp

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node.js dependencies (skip husky in production)
RUN npm ci --omit=dev --ignore-scripts

# Copy source code
COPY . .

# Build the application
RUN npm run build

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

# Start the bot
CMD ["npm", "start"]
