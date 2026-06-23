#!/usr/bin/env bash
# Staging deploy — builds + runs the isolated `lucky-staging` stack from an
# arbitrary branch/ref so a frontend/dashboard change can be visually verified
# at https://lucky-staging.lucassantana.tech before it merges to main.
#
# Invoked by the homelab webhook (deploy/hooks.json → deploy-staging hook) with:
#   $1 = X-Webhook-Secret   (validated against DEPLOY_WEBHOOK_SECRET)
#   $2 = X-Deploy-Ref        (branch name or commit SHA to deploy)
#
# Self-contained on purpose: it must NEVER reuse prod's deploy.sh (which resets
# the prod checkout to origin/main and restarts prod services). This script
# operates only inside STAGING_DIR with the staging compose project.
set -euo pipefail

LOG_PREFIX="[deploy-staging]"
log() { echo "$LOG_PREFIX $(date '+%H:%M:%S') $1"; }

WEBHOOK_SECRET_ARG="${1:-}"
DEPLOY_REF="${2:-main}"

STAGING_DIR="${STAGING_DIR:-/home/luk-server/lucky-staging}"
# Staging INFRA (compose) comes from the prod checkout (always main) so ANY
# target branch can be staged even if it predates this file. The app SOURCE for
# the build comes from STAGING_DIR via --project-directory.
COMPOSE_FILE="${STAGING_COMPOSE_FILE:-/home/luk-server/Lucky/docker-compose.staging.yml}"
ENV_FILE=".env.staging"
PROJECT="lucky-staging"
HEALTH_PORT="${NGINX_PORT:-8093}"

# --- secret gate ---------------------------------------------------------------
if [[ -z "${DEPLOY_WEBHOOK_SECRET:-}" ]]; then
    log "ERROR: DEPLOY_WEBHOOK_SECRET not set in environment"
    exit 1
fi
if [[ "$WEBHOOK_SECRET_ARG" != "$DEPLOY_WEBHOOK_SECRET" ]]; then
    log "ERROR: webhook secret mismatch — refusing to deploy"
    exit 1
fi

# --- single-flight lock --------------------------------------------------------
LOCK_DIR="/tmp/lucky-staging-deploy.lock"
if ! mkdir "$LOCK_DIR" 2>/dev/null; then
    log "ERROR: another staging deploy is in progress ($LOCK_DIR) — aborting"
    exit 1
fi
trap 'rm -rf "$LOCK_DIR" 2>/dev/null || true' EXIT

dc() {
    docker compose -p "$PROJECT" -f "$COMPOSE_FILE" \
        --project-directory "$STAGING_DIR" --env-file "$STAGING_DIR/$ENV_FILE" "$@"
}

# --- checkout the requested ref ------------------------------------------------
if [[ ! -d "$STAGING_DIR/.git" ]]; then
    log "ERROR: staging checkout missing at $STAGING_DIR (clone the repo there first)"
    exit 1
fi
cd "$STAGING_DIR"

if [[ ! -f "$ENV_FILE" ]]; then
    log "ERROR: $STAGING_DIR/$ENV_FILE missing (host-managed staging env)"
    exit 1
fi

log "Fetching + checking out ref: $DEPLOY_REF"
git fetch --prune --quiet origin
# Resolve the ref to a concrete SHA (works for branch names or SHAs).
RESOLVED_SHA="$(git rev-parse --verify --quiet "origin/$DEPLOY_REF^{commit}" \
    || git rev-parse --verify --quiet "$DEPLOY_REF^{commit}" || true)"
if [[ -z "$RESOLVED_SHA" ]]; then
    log "ERROR: could not resolve ref '$DEPLOY_REF' to a commit"
    exit 1
fi
git checkout --quiet --force --detach "$RESOLVED_SHA"
log "Checked out $DEPLOY_REF -> ${RESOLVED_SHA:0:7}"
export IMAGE_TAG="staging-${RESOLVED_SHA:0:7}"

# --- build (locally; CI only builds main images) -------------------------------
log "Building staging images (backend, frontend, nginx)..."
if ! dc build backend frontend nginx; then
    log "ERROR: BUILD_FAILED"
    exit 1
fi

# --- data services + migrations ------------------------------------------------
log "Starting postgres + redis..."
dc up -d postgres redis

log "Waiting for postgres..."
for _ in $(seq 1 30); do
    if dc exec -T postgres pg_isready -U discordbot -d discordbot >/dev/null 2>&1; then break; fi
    sleep 2
done

log "Running database migrations (staging DB)..."
if ! dc run --rm --no-deps backend \
    sh -lc "npx prisma migrate deploy --config prisma/prisma.config.ts --schema prisma/schema.prisma"; then
    log "ERROR: MIGRATION_FAILED"
    exit 1
fi

# --- roll out ------------------------------------------------------------------
log "Rolling out staging services..."
dc up -d --remove-orphans backend frontend nginx

# Routing is via the published HOST PORT: the production cloudflared tunnel's
# remote ingress routes lucky-staging.* -> http://100.95.204.103:8093 (this nginx's
# host port). Deliberately NOT attached to the tunnel's docker network — the
# staging nginx service is named `nginx`, so sharing the tunnel's network would
# make the `nginx` alias ambiguous between prod and staging and could misroute
# production traffic. The host port is reachable from the tunnel's network, so
# nothing to wire here.

# --- health check --------------------------------------------------------------
log "Health-checking staging (http://localhost:${HEALTH_PORT})..."
ok=""
for _ in $(seq 1 30); do
    if curl -fsS --max-time 4 "http://localhost:${HEALTH_PORT}/api/health" >/dev/null 2>&1; then
        ok="1"; break
    fi
    sleep 3
done
if [[ -z "$ok" ]]; then
    log "ERROR: HEALTH_FAILED — staging API did not become ready"
    dc ps
    dc logs --tail=60 --no-color backend nginx || true
    exit 1
fi

# Verify the OAuth contract endpoint too (the dashboard depends on it).
if ! curl -fsS --max-time 4 "http://localhost:${HEALTH_PORT}/api/health/auth-config" >/dev/null 2>&1; then
    log "WARN: auth-config endpoint not ready (dashboard login may fail)"
fi

log "STAGING DEPLOY OK — ${DEPLOY_REF} (${RESOLVED_SHA:0:7}) live at https://lucky-staging.lucassantana.tech"
