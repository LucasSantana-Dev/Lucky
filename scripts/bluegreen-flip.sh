#!/usr/bin/env bash

# Blue/green deployment flip script for Lucky web tier (backend + frontend).
# This script is run by the deploy pipeline to flip traffic between blue and
# green services with zero HTTP downtime.
#
# IMPORTANT: All Prisma migrations must be BACKWARD-COMPATIBLE (expand-migrate-contract
# pattern) because blue and green services run against the SAME Postgres during
# the flip. Destructive operations (DROP, ALTER DROP, renames) must not ship in
# the same deploy as the code that stops using them.
#
# Usage: ./scripts/bluegreen-flip.sh <backend|frontend> <blue|green>
#
# Example:
#   docker compose up -d --no-deps backend-green  # bring up green
#   ./scripts/bluegreen-flip.sh backend green      # flip traffic to green
#   docker compose up -d --no-deps --no-build frontend-blue  # bring up blue
#   ./scripts/bluegreen-flip.sh frontend blue      # flip traffic to blue

set -euo pipefail

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.staging.yml}"
NGINX_CONFIG_DIR="${NGINX_CONFIG_DIR:-nginx}"
UPSTREAM_CONFIG="${NGINX_CONFIG_DIR}/upstream-active.conf"

# Health check endpoint
HEALTH_ENDPOINT="/health"
HEALTH_TIMEOUT_SECS=90
HEALTH_CHECK_INTERVAL_SECS=2

# Log function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

die() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $*" >&2
    exit 1
}

usage() {
    die "Usage: $0 <backend|frontend> <blue|green>"
}

if [[ $# -ne 2 ]]; then
    usage
fi

SERVICE="$1"
COLOR="$2"

# Validate inputs
if [[ "$SERVICE" != "backend" && "$SERVICE" != "frontend" ]]; then
    die "SERVICE must be 'backend' or 'frontend', got '$SERVICE'"
fi

if [[ "$COLOR" != "blue" && "$COLOR" != "green" ]]; then
    die "COLOR must be 'blue' or 'green', got '$COLOR'"
fi

# Determine the container name and port based on service
case "$SERVICE" in
    backend)
        CONTAINER_NAME="lucky-staging-backend-$COLOR"
        PORT=3000
        ;;
    frontend)
        CONTAINER_NAME="lucky-staging-frontend-$COLOR"
        PORT=8080
        ;;
esac

# Determine the old color (opposite of the new color)
OLD_COLOR=$([ "$COLOR" = "blue" ] && echo "green" || echo "blue")

log "Starting flip: $SERVICE from $OLD_COLOR to $COLOR"

# Step 1: Wait for the target container to be healthy
log "Waiting for $CONTAINER_NAME to be healthy..."
START_TIME=$(date +%s)

while true; do
    CURRENT_TIME=$(date +%s)
    ELAPSED=$((CURRENT_TIME - START_TIME))

    if [[ $ELAPSED -gt $HEALTH_TIMEOUT_SECS ]]; then
        die "Timeout waiting for $CONTAINER_NAME to become healthy (${HEALTH_TIMEOUT_SECS}s exceeded)"
    fi

    # Use docker compose exec to check health via curl inside the container
    if docker compose -f "$COMPOSE_FILE" exec -T "$SERVICE-$COLOR" \
        curl -f -s "http://localhost:$PORT$HEALTH_ENDPOINT" > /dev/null 2>&1; then
        log "$CONTAINER_NAME is healthy"
        break
    fi

    log "Health check failed, retrying in ${HEALTH_CHECK_INTERVAL_SECS}s... ($ELAPSED/${HEALTH_TIMEOUT_SECS}s)"
    sleep "$HEALTH_CHECK_INTERVAL_SECS"
done

# Step 2: Update the nginx upstream config file
log "Updating $UPSTREAM_CONFIG to point to $COLOR..."

# Read current config and replace the upstream pointers
TEMP_CONFIG=$(mktemp)
trap "rm -f $TEMP_CONFIG" EXIT

cat > "$TEMP_CONFIG" << EOF
# Blue/green upstream configuration (included by nginx.conf).
# This file is rewritten by scripts/bluegreen-flip.sh to flip traffic
# between blue and green backend/frontend services.
#
# Last updated: $(date -u +'%Y-%m-%dT%H:%M:%SZ')
# Active color: $COLOR

set \$backend_upstream http://backend-${COLOR}:3000;
set \$frontend_upstream http://frontend-${COLOR}:8080;
EOF

cp "$TEMP_CONFIG" "$UPSTREAM_CONFIG"
log "Updated $UPSTREAM_CONFIG"

# Step 3: Reload nginx (zero-downtime reload)
log "Reloading nginx..."
docker compose -f "$COMPOSE_FILE" exec -T nginx nginx -s reload
log "Nginx reloaded successfully"

# Step 4: Stop the old container (after draining)
# Give existing connections a few seconds to drain to the new color
log "Draining connections from $SERVICE-$OLD_COLOR (5s)..."
sleep 5

log "Stopping $SERVICE-$OLD_COLOR..."
docker compose -f "$COMPOSE_FILE" stop "$SERVICE-$OLD_COLOR"
log "Stopped $SERVICE-$OLD_COLOR"

log "Flip complete: $SERVICE is now running on $COLOR"
