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

# Health check tuning (readiness comes from each image's baked HEALTHCHECK)
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

# Determine the container name per service. Readiness is taken from the image's
# baked HEALTHCHECK (see Step 1), so no per-service probe path/port is needed.
case "$SERVICE" in
    backend)
        CONTAINER_NAME="lucky-staging-backend-$COLOR"
        ;;
    frontend)
        CONTAINER_NAME="lucky-staging-frontend-$COLOR"
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

    # Read the container's reported health from its baked HEALTHCHECK — the
    # backend image probes via Node (it ships no curl) and the frontend via
    # curl, so this works for both without exec-ing a probe that may not exist.
    STATUS=$(docker inspect \
        --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}no-healthcheck{{end}}' \
        "$CONTAINER_NAME" 2>/dev/null || echo "missing")
    if [[ "$STATUS" == "healthy" ]]; then
        log "$CONTAINER_NAME is healthy"
        break
    fi

    log "Health status: $STATUS, retrying in ${HEALTH_CHECK_INTERVAL_SECS}s... ($ELAPSED/${HEALTH_TIMEOUT_SECS}s)"
    sleep "$HEALTH_CHECK_INTERVAL_SECS"
done

# Step 2: Update the nginx upstream config file.
# Flip ONLY the target service's upstream — the other tier keeps its current
# color (parsed from the existing config). Rewriting both lines would silently
# repoint the untouched tier at a color whose container may not be running.
log "Updating $UPSTREAM_CONFIG to point $SERVICE to $COLOR..."

# Current color of a service, read back from the active config (defaults to
# blue if the line is missing — matches the initial-deploy default).
current_color_of() {
    local svc="$1"
    grep -oE "${svc}-(blue|green)" "$UPSTREAM_CONFIG" 2> /dev/null \
        | grep -oE '(blue|green)' | head -1 || true
}

if [[ "$SERVICE" == "backend" ]]; then
    BACKEND_COLOR="$COLOR"
    FRONTEND_COLOR="$(current_color_of frontend)"
else
    BACKEND_COLOR="$(current_color_of backend)"
    FRONTEND_COLOR="$COLOR"
fi
BACKEND_COLOR="${BACKEND_COLOR:-blue}"
FRONTEND_COLOR="${FRONTEND_COLOR:-blue}"

# Snapshot the current config so we can roll back on a failed reload.
PREV_CONFIG=$(mktemp)
TEMP_CONFIG=$(mktemp)
trap 'rm -f "$TEMP_CONFIG" "$PREV_CONFIG"' EXIT
cp "$UPSTREAM_CONFIG" "$PREV_CONFIG"

cat > "$TEMP_CONFIG" << EOF
# Blue/green upstream configuration (included by nginx.conf).
# This file is rewritten by scripts/bluegreen-flip.sh to flip traffic
# between blue and green backend/frontend services.
#
# Last updated: $(date -u +'%Y-%m-%dT%H:%M:%SZ')
# Active: backend=$BACKEND_COLOR frontend=$FRONTEND_COLOR

set \$backend_upstream http://backend-${BACKEND_COLOR}:3000;
set \$frontend_upstream http://frontend-${FRONTEND_COLOR}:8080;
EOF

cp "$TEMP_CONFIG" "$UPSTREAM_CONFIG"
log "Updated $UPSTREAM_CONFIG (backend=$BACKEND_COLOR frontend=$FRONTEND_COLOR)"

# Step 3: Validate the config BEFORE reloading. `nginx -s reload` only signals
# the master, which keeps the old config on a bad apply — so without this test a
# rejected config would still fall through to Step 4 and stop the live color.
log "Validating nginx config..."
if ! docker compose -f "$COMPOSE_FILE" exec -T nginx nginx -t; then
    cp "$PREV_CONFIG" "$UPSTREAM_CONFIG"
    die "nginx config test failed — rolled back $UPSTREAM_CONFIG, traffic unchanged"
fi

# Reload (zero-downtime). On failure, restore the previous config so the on-disk
# file never drifts from the running nginx.
log "Reloading nginx..."
if ! docker compose -f "$COMPOSE_FILE" exec -T nginx nginx -s reload; then
    cp "$PREV_CONFIG" "$UPSTREAM_CONFIG"
    die "nginx reload failed — rolled back $UPSTREAM_CONFIG, traffic unchanged"
fi
log "Nginx reloaded successfully"

# Step 4: Stop the old container (after draining)
# Give existing connections a few seconds to drain to the new color
log "Draining connections from $SERVICE-$OLD_COLOR (5s)..."
sleep 5

log "Stopping $SERVICE-$OLD_COLOR..."
docker compose -f "$COMPOSE_FILE" stop "$SERVICE-$OLD_COLOR"
log "Stopped $SERVICE-$OLD_COLOR"

log "Flip complete: $SERVICE is now running on $COLOR"
