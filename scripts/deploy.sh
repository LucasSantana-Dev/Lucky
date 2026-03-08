#!/bin/bash
set -e

RECEIVED_SECRET="${1:-}"
EXPECTED_SECRET="${DEPLOY_WEBHOOK_SECRET:-}"
DEPLOY_DIR="${DEPLOY_DIR:-/repo}"
LOG_PREFIX="[deploy]"

log() { echo "$LOG_PREFIX $(date '+%H:%M:%S') $1"; }

if [ -z "$EXPECTED_SECRET" ]; then
    log "ERROR: DEPLOY_WEBHOOK_SECRET not configured"
    exit 1
fi

if [ "$RECEIVED_SECRET" != "$EXPECTED_SECRET" ]; then
    log "ERROR: invalid webhook secret"
    exit 1
fi

cd "$DEPLOY_DIR"
git config --global --add safe.directory "$DEPLOY_DIR"

log "Pulling latest changes..."
git pull origin main

log "Building images..."
docker compose build --parallel bot backend frontend nginx

log "Rolling out services..."
docker compose up -d --remove-orphans bot backend frontend nginx postgres redis

log "Waiting for health checks..."
sleep 10

log "Service status:"
docker compose ps --format "table {{.Name}}\t{{.Status}}"

unhealthy=$(docker compose ps --format json | grep -c '"unhealthy"' || true)
if [ "$unhealthy" -gt 0 ]; then
    log "ERROR: $unhealthy unhealthy container(s)"
    docker compose logs --tail=20 --no-color
    exit 1
fi

log "Pruning old images..."
docker image prune -f --filter "until=24h"

log "Deploy complete!"
