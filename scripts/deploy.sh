#!/bin/bash
set -e

RECEIVED_SECRET="${1:-}"
EXPECTED_SECRET="${DEPLOY_WEBHOOK_SECRET:-}"
DEPLOY_DIR="${DEPLOY_DIR:-/repo}"
DISCORD_WEBHOOK="${DISCORD_DEPLOY_WEBHOOK:-}"
LOG_PREFIX="[deploy]"
LOCK_DIR="/tmp/lucky-deploy.lock"
LOCK_PID_FILE="$LOCK_DIR/pid"
COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-lucky}"

export COMPOSE_PROJECT_NAME

log() { echo "$LOG_PREFIX $(date '+%H:%M:%S') $1"; }

resolve_compose_workdir() {
    if [ -n "${COMPOSE_WORKDIR:-}" ]; then
        echo "$COMPOSE_WORKDIR"
        return
    fi

    local existing_workdir
    existing_workdir=$(docker inspect lucky-backend \
        --format '{{ index .Config.Labels "com.docker.compose.project.working_dir" }}' \
        2>/dev/null || true)

    if [ -n "$existing_workdir" ]; then
        echo "$existing_workdir"
        return
    fi

    echo "$DEPLOY_DIR"
}

docker_compose() {
    docker compose \
        --project-directory "$COMPOSE_WORKDIR" \
        -p "$COMPOSE_PROJECT_NAME" \
        "$@"
}

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

acquire_lock() {
    if mkdir "$LOCK_DIR" 2>/dev/null; then
        echo "$$" >"$LOCK_PID_FILE"
        return 0
    fi

    local existing_pid=""
    if [ -f "$LOCK_PID_FILE" ]; then
        existing_pid=$(cat "$LOCK_PID_FILE" 2>/dev/null || true)
    fi

    if [ -n "$existing_pid" ] && kill -0 "$existing_pid" 2>/dev/null; then
        return 1
    fi

    rm -rf "$LOCK_DIR" 2>/dev/null || true
    mkdir "$LOCK_DIR" 2>/dev/null || return 1
    echo "$$" >"$LOCK_PID_FILE"
    return 0
}

if [ -z "$EXPECTED_SECRET" ]; then
    log "ERROR: DEPLOY_WEBHOOK_SECRET not configured"
    exit 1
fi

if [ "$RECEIVED_SECRET" != "$EXPECTED_SECRET" ]; then
    log "ERROR: invalid webhook secret"
    exit 1
fi

if ! acquire_lock; then
    log "ERROR: another deploy is already running"
    notify 16711680 "Deploy Skipped" "Another deploy is already in progress"
    exit 1
fi
trap 'rm -rf "$LOCK_DIR" 2>/dev/null || true' EXIT

COMPOSE_WORKDIR="$(resolve_compose_workdir)"

cd "$DEPLOY_DIR"
git config --global --add safe.directory "$DEPLOY_DIR"

notify 16776960 "Deploy Started" "Pulling latest changes and rebuilding..."

log "Pulling latest changes..."
git pull origin main

log "Pulling images..."
if ! docker_compose pull bot backend frontend nginx; then
    log "WARN: Pull failed, falling back to local build..."
    if ! docker_compose build --parallel bot backend frontend nginx; then
        notify 16711680 "Deploy Failed" "Docker build failed"
        exit 1
    fi
fi

log "Rolling out services..."
docker_compose up -d --remove-orphans bot backend frontend nginx postgres redis

log "Restarting Cloudflare tunnel..."
if docker_compose --profile tunnel up -d cloudflared >/dev/null 2>&1; then
    log "Cloudflare tunnel restarted via compose profile"
elif docker ps --format '{{.Names}}' | grep -qx "lucky-tunnel"; then
    docker restart lucky-tunnel >/dev/null
    log "Cloudflare tunnel restarted via container restart"
else
    log "WARN: Could not restart cloudflared (service unavailable)"
fi

log "Waiting for health checks..."
sleep 10

log "Service status:"
docker_compose ps --format "table {{.Name}}\t{{.Status}}"

unhealthy=$(docker_compose ps --format json | grep -c '"unhealthy"' || true)
if [ "$unhealthy" -gt 0 ]; then
    log "ERROR: $unhealthy unhealthy container(s)"
    docker_compose logs --tail=20 --no-color
    notify 16711680 "Deploy Failed" "$unhealthy unhealthy container(s)"
    exit 1
fi

log "Pruning old images..."
docker image prune -f --filter "until=24h"

log "Deploy complete!"
notify 65280 "Deploy Successful" "All services healthy and running"
