#!/bin/bash
set -e

RECEIVED_SECRET="${1:-}"
EXPECTED_SECRET="${DEPLOY_WEBHOOK_SECRET:-}"
DEPLOY_DIR="${DEPLOY_DIR:-/repo}"
DISCORD_WEBHOOK="${DISCORD_DEPLOY_WEBHOOK:-}"
LOG_PREFIX="[deploy]"

log() { echo "$LOG_PREFIX $(date '+%H:%M:%S') $1"; }

notify() {
    local color="$1" title="$2" desc="$3"
    [ -z "$DISCORD_WEBHOOK" ] && return
    local commit_msg commit_sha
    commit_sha=$(git -C "$DEPLOY_DIR" rev-parse --short HEAD 2>/dev/null || echo "unknown")
    commit_msg=$(git -C "$DEPLOY_DIR" log -1 --format='%s' 2>/dev/null || echo "unknown")
    curl -s -o /dev/null -X POST "$DISCORD_WEBHOOK" \
        -H "Content-Type: application/json" \
        -d "{
            \"embeds\": [{
                \"title\": \"$title\",
                \"description\": \"$desc\",
                \"color\": $color,
                \"fields\": [
                    {\"name\": \"Commit\", \"value\": \"\`$commit_sha\` $commit_msg\", \"inline\": false}
                ],
                \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
            }]
        }" || true
}

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

notify 16776960 "Deploy Started" "Pulling latest changes and rebuilding..."

log "Pulling latest changes..."
git pull origin main

log "Pulling images..."
if ! docker compose pull bot backend frontend nginx; then
    log "WARN: Pull failed, falling back to local build..."
    if ! docker compose build --parallel bot backend frontend nginx; then
        notify 16711680 "Deploy Failed" "Docker build failed"
        exit 1
    fi
fi

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
    notify 16711680 "Deploy Failed" "$unhealthy unhealthy container(s)"
    exit 1
fi

log "Pruning old images..."
docker image prune -f --filter "until=24h"

log "Deploy complete!"
notify 65280 "Deploy Successful" "All services healthy and running"
