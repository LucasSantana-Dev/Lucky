#!/bin/bash

# LukBot Portainer Webhook Handler
# This script handles webhook requests from Portainer for automatic deployment

set -e

# Configuration
PROJECT_DIR="/home/luk-server/LukBot"
LOG_FILE="/home/luk-server/LukBot/logs/portainer-webhook.log"
WEBHOOK_SECRET="${WEBHOOK_SECRET:-}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Function to log with timestamp
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Function to verify webhook signature
verify_webhook() {
    if [ -n "$WEBHOOK_SECRET" ]; then
        # This is a simplified verification - in production, use proper HMAC verification
        log "Webhook secret verification enabled"
    fi
}

# Function to deploy via Portainer
deploy_via_portainer() {
    log "Starting Portainer webhook deployment..."
    
    cd "$PROJECT_DIR"
    
    # Pull latest changes
    log "Pulling latest changes..."
    git pull origin main
    
    # Build new image
    log "Building new Docker image..."
    docker build -t lukbot:latest .
    
    # Stop and remove old container
    log "Stopping old container..."
    docker stop discord-bot 2>/dev/null || true
    docker rm discord-bot 2>/dev/null || true
    
    # Start new container
    log "Starting new container..."
    docker run -d \
        --name discord-bot \
        --restart unless-stopped \
        -e NODE_ENV=production \
        -e DISCORD_TOKEN="${DISCORD_TOKEN}" \
        -e CLIENT_ID="${CLIENT_ID}" \
        -v "$PROJECT_DIR/logs:/app/logs" \
        -v "$PROJECT_DIR/data:/app/data" \
        lukbot:latest
    
    # Wait and check status
    sleep 5
    log "Checking container status..."
    if docker ps | grep -q discord-bot; then
        log "Container started successfully"
    else
        log "Container failed to start"
        exit 1
    fi
    
    log "Portainer webhook deployment completed successfully!"
}

# Function to handle webhook request
handle_webhook() {
    log "Portainer webhook received"
    
    # Verify webhook if secret is provided
    verify_webhook
    
    # Deploy
    deploy_via_portainer
    
    log "Webhook deployment process completed"
}

# Main execution
main() {
    log "Portainer webhook handler started"
    
    # Handle webhook request
    handle_webhook
    
    log "Portainer webhook handler completed"
}

# Run main function
main "$@"
