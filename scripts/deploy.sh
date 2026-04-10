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
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

export COMPOSE_PROJECT_NAME

log() { echo "$LOG_PREFIX $(date '+%H:%M:%S') $1"; }

resolve_cloudflared_config_dir() {
    if [[ -n "${CLOUDFLARED_CONFIG_DIR:-}" ]]; then
        echo "$CLOUDFLARED_CONFIG_DIR"
        return
    fi

    if [[ -f "$DEPLOY_DIR/cloudflared/config-lucky.yml" ]]; then
        echo "$DEPLOY_DIR/cloudflared"
        return
    fi

    if [[ -d "/home/luk-server/.cloudflared" ]]; then
        echo "/home/luk-server/.cloudflared"
        return
    fi

    echo "${HOME}/.cloudflared"
}

resolve_compose_workdir() {
    if [[ -n "${COMPOSE_WORKDIR:-}" ]]; then
        echo "$COMPOSE_WORKDIR"
        return
    fi

    local existing_workdir
    existing_workdir=$(docker inspect lucky-backend \
        --format '{{ index .Config.Labels "com.docker.compose.project.working_dir" }}' \
        2>/dev/null || true)

    if [[ -n "$existing_workdir" ]]; then
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

resolve_http_probe_script() {
    local script_path="$SCRIPT_DIR/http-probe.sh"

    if [[ -x "$script_path" ]]; then
        echo "$script_path"
        return
    fi

    echo "$DEPLOY_DIR/scripts/http-probe.sh"
}

notify() {
    local color="$1" title="$2" desc="$3"
    [[ -z "$DISCORD_WEBHOOK" ]] && return
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
                    {
                        \"name\": \"Commit\",
                        \"value\": \"'$commit_sha' $commit_msg\",
                        \"inline\": false
                    }
                ],
                \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"
            }]
        }" || true
}

print_targeted_logs() {
    log "Collecting backend/nginx/postgres/redis logs..."
    docker_compose logs --tail=80 --no-color backend nginx postgres redis || true
}

verify_cloudflared_config() {
    local config_dir="$1"
    local config_path="$config_dir/config-lucky.yml"
    local credentials_container_path
    local credentials_basename
    local credentials_host_path

    if [[ ! -f "$config_path" ]]; then
        log "ERROR: cloudflared config not found at $config_path"
        return 1
    fi

    credentials_container_path=$(awk -F': ' \
        '/^credentials-file:/ {print $2}' "$config_path" | tr -d '\r' | tail -1)

    if [[ -z "$credentials_container_path" ]]; then
        log "ERROR: credentials-file missing in $config_path"
        return 1
    fi

    credentials_basename=$(basename "$credentials_container_path")
    credentials_host_path="$config_dir/$credentials_basename"

    if [[ ! -f "$credentials_host_path" ]]; then
        log "ERROR: cloudflared credentials not found at $credentials_host_path"
        log "ERROR: expected by config credentials-file=$credentials_container_path"
        return 1
    fi

    log "Cloudflare tunnel config verified at $config_path"
}

require_running_containers() {
    local required
    required=(lucky-backend lucky-nginx lucky-postgres lucky-redis)
    local missing=()
    local not_running=()
    local container running

    for container in "${required[@]}"; do
        if ! docker inspect "$container" >/dev/null 2>&1; then
            missing+=("$container")
            continue
        fi

        running=$(docker inspect -f '{{.State.Running}}' "$container" 2>/dev/null || echo "false")
        if [[ "$running" != "true" ]]; then
            not_running+=("$container")
        fi
    done

    if [[ "${#missing[@]}" -gt 0 ]] || [[ "${#not_running[@]}" -gt 0 ]]; then
        [[ "${#missing[@]}" -gt 0 ]] && log "ERROR: missing containers: ${missing[*]}"
        [[ "${#not_running[@]}" -gt 0 ]] && \
            log "ERROR: containers not running: ${not_running[*]}"
        return 1
    fi

    return 0
}

resolve_postgres_password() {
    if [[ -n "${POSTGRES_PASSWORD:-}" ]]; then
        echo "$POSTGRES_PASSWORD"
        return
    fi

    local env_file="$COMPOSE_WORKDIR/.env"
    if [[ -f "$env_file" ]]; then
        local value
        value=$(awk -F= '/^POSTGRES_PASSWORD=/{print substr($0, index($0, "=") + 1); exit}' \
            "$env_file")
        if [[ -n "$value" ]]; then
            echo "$value"
            return
        fi
    fi

    echo ""
}

archive_local_checkout_state() {
    local changes archive_root timestamp archive_prefix stash_label stash_output
    changes="$(git status --porcelain 2>/dev/null || true)"
    if [[ -z "$changes" ]]; then
        log "Checkout is clean before origin sync"
        return 0
    fi

    archive_root="${DEPLOY_ARCHIVE_DIR:-${HOME}/.lucky/deploy-archive}"
    timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
    archive_prefix="${archive_root}/${timestamp}"

    if ! mkdir -p "$archive_root"; then
        log "ERROR: CHECKOUT_RECOVERY_FAILED (cannot create archive dir: $archive_root)"
        return 1
    fi

    git status --short >"${archive_prefix}-status.txt"
    git diff >"${archive_prefix}-tracked.diff"
    git diff --cached >"${archive_prefix}-staged.diff"
    git ls-files --others --exclude-standard >"${archive_prefix}-untracked.txt"

    stash_label="deploy-archive-${timestamp}"
    stash_output="$(git stash push -u -m "$stash_label" 2>&1 || true)"

    if [[ "$stash_output" == *"No local changes to save"* ]]; then
        log "Checkout drift archive skipped (changes disappeared during snapshot)"
        return 0
    fi

    if ! git stash list | grep -qF "$stash_label"; then
        log "ERROR: CHECKOUT_RECOVERY_FAILED (stash failed: $stash_output)"
        return 1
    fi

    log "Archived checkout drift at ${archive_prefix}-* with stash ${stash_label}"
    return 0
}

sync_checkout_to_origin_main() {
    local drift_after_reset

    if ! archive_local_checkout_state; then
        return 1
    fi

    if ! git fetch origin main; then
        log "ERROR: CHECKOUT_FETCH_FAILED (git fetch origin main)"
        return 1
    fi

    if ! git reset --hard origin/main; then
        log "ERROR: CHECKOUT_RECOVERY_FAILED (git reset --hard origin/main)"
        return 1
    fi

    if ! git clean -fd; then
        log "ERROR: CHECKOUT_RECOVERY_FAILED (git clean -fd)"
        return 1
    fi

    drift_after_reset="$(git status --porcelain 2>/dev/null || true)"
    if [[ -n "$drift_after_reset" ]]; then
        log "ERROR: CHECKOUT_RECOVERY_FAILED (tree not clean after reset)"
        return 1
    fi

    log "Checkout synced to origin/main and verified clean"
    return 0
}

wait_for_http_ready() {
    local label="$1"
    local url="$2"
    local body_pattern="$3"
    local attempt response http_code body probe_script
    probe_script="$(resolve_http_probe_script)"

    for attempt in $(seq 1 18); do
        response=$("$probe_script" "$url" || true)
        http_code=$(printf '%s\n' "$response" | sed -n '1p')
        body=$(printf '%s\n' "$response" | sed '1d')

        if [[ "$http_code" = "200" ]] && echo "$body" | grep -Eq "$body_pattern"; then
            log "$label ready (HTTP 200)"
            return 0
        fi

        if [[ "$http_code" =~ ^5[0-9][0-9]$ ]]; then
            log "$label upstream unavailable (HTTP $http_code) - attempt $attempt/18"
        else
            log "$label not ready (HTTP $http_code) - attempt $attempt/18"
        fi

        sleep 5
    done

    log "ERROR: timed out waiting for $label readiness at $url"
    return 1
}

acquire_lock() {
    if mkdir "$LOCK_DIR" 2>/dev/null; then
        echo "$$" >"$LOCK_PID_FILE"
        return 0
    fi

    local existing_pid=""
    if [[ -f "$LOCK_PID_FILE" ]]; then
        existing_pid=$(cat "$LOCK_PID_FILE" 2>/dev/null || true)
    fi

    if [[ -n "$existing_pid" ]] && kill -0 "$existing_pid" 2>/dev/null; then
        return 1
    fi

    rm -rf "$LOCK_DIR" 2>/dev/null || true
    mkdir "$LOCK_DIR" 2>/dev/null || return 1
    echo "$$" >"$LOCK_PID_FILE"
    return 0
}

if [[ -z "$EXPECTED_SECRET" ]]; then
    log "ERROR: DEPLOY_WEBHOOK_SECRET not configured"
    exit 1
fi

if [[ "$RECEIVED_SECRET" != "$EXPECTED_SECRET" ]]; then
    log "ERROR: invalid webhook secret"
    exit 1
fi

if ! acquire_lock; then
    log "ERROR: LOCK_CONTENTION (another deploy is already running)"
    notify 16711680 "Deploy Skipped" "Another deploy is already in progress"
    exit 1
fi
trap 'rm -rf "$LOCK_DIR" 2>/dev/null || true' EXIT

COMPOSE_WORKDIR="$(resolve_compose_workdir)"
CLOUDFLARED_CONFIG_DIR="$(resolve_cloudflared_config_dir)"
POSTGRES_PASSWORD_EFFECTIVE="$(resolve_postgres_password)"

if [[ -z "$POSTGRES_PASSWORD_EFFECTIVE" ]]; then
    log "ERROR: POSTGRES_PASSWORD is required"
    notify 16711680 "Deploy Failed" "POSTGRES_PASSWORD is required"
    exit 1
fi

export POSTGRES_PASSWORD="$POSTGRES_PASSWORD_EFFECTIVE"
export CLOUDFLARED_CONFIG_DIR

log "Using CLOUDFLARED_CONFIG_DIR=$CLOUDFLARED_CONFIG_DIR"

cd "$DEPLOY_DIR"
git config --global --add safe.directory "$DEPLOY_DIR"

notify 16776960 "Deploy Started" "Pulling latest changes and rebuilding..."

log "Synchronizing checkout with origin/main..."
if ! sync_checkout_to_origin_main; then
    log "ERROR: CHECKOUT_RECOVERY_FAILED (unable to prepare clean checkout)"
    notify 16711680 "Deploy Failed" "Checkout recovery failed"
    exit 1
fi

# Rebuild webhook early: after git pull lands new hooks.json/Dockerfile but
# BEFORE the long build/migrate/rollout phase. The -V flag renews anonymous
# volumes so the COPY'd hooks.json from the Dockerfile takes effect.
#
# IMPORTANT: Skip if we're running INSIDE the webhook container (detected by
# /.dockerenv + hostname matching the webhook container ID). Rebuilding from
# inside kills our own process. The webhook will be rebuilt on the NEXT deploy.
if [[ -f /.dockerenv ]] && \
   docker inspect lucky-webhook --format '{{.Id}}' 2>/dev/null | grep -q "$(hostname)"; then
    log "Skipping webhook rebuild (running inside webhook container)"
else
    log "Rebuilding webhook container (early, before app build)..."
    if docker_compose build --no-cache webhook 2>/dev/null; then
        docker_compose up -d -V --force-recreate --no-deps webhook 2>/dev/null || true
        log "Webhook container rebuilt successfully"
    else
        log "WARN: Webhook rebuild failed (non-fatal, will retry next deploy)"
    fi
fi

log "Pulling images..."
if ! docker_compose pull bot backend frontend nginx; then
    log "WARN: Pull failed, falling back to local build..."
    _build_commit_sha=$(git -C "$DEPLOY_DIR" rev-parse HEAD 2>/dev/null || echo "")
    if ! docker_compose build --parallel \
            --build-arg "COMMIT_SHA=${_build_commit_sha}" \
            bot backend frontend nginx; then
        notify 16711680 "Deploy Failed" "Docker build failed"
        exit 1
    fi
fi

log "Starting database services..."
docker_compose up -d postgres redis

log "Running database migrations..."
if ! docker_compose run --rm --no-deps backend \
    sh -lc "npx prisma migrate deploy --config prisma/prisma.config.ts --schema prisma/schema.prisma"; then
    log "ERROR: MIGRATION_FAILED (prisma migrate deploy)"
    notify 16711680 "Deploy Failed" "Database migration failed"
    exit 1
fi

log "Checking migration status..."
if ! docker_compose run --rm --no-deps backend \
    sh -lc "npx prisma migrate status --config prisma/prisma.config.ts --schema prisma/schema.prisma"; then
    log "ERROR: MIGRATION_FAILED (prisma migrate status)"
    notify 16711680 "Deploy Failed" "Database migration status guard failed"
    exit 1
fi

relation_guard_script=$(
    cat <<'NODE'
import { verifyRequiredDatabaseRelations } from '@lucky/shared/utils'

try {
    await verifyRequiredDatabaseRelations()
    console.log('DB schema guard passed')
} catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(message)
    process.exit(1)
}
NODE
)

log "Verifying required database relations..."
if ! docker_compose run --rm --no-deps backend \
    node --input-type=module -e "$relation_guard_script"; then
    log "ERROR: RUNTIME_PRECHECK_FAILED (required relation verification)"
    notify 16711680 "Deploy Failed" "Database relation guard failed"
    exit 1
fi

log "Rolling out services..."
docker_compose up -d --remove-orphans --no-deps bot backend frontend nginx postgres redis

if ! verify_cloudflared_config "$CLOUDFLARED_CONFIG_DIR"; then
    print_targeted_logs
    notify 16711680 "Deploy Failed" "Runtime precheck failed (cloudflared config)"
    exit 1
fi

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

if ! require_running_containers; then
    print_targeted_logs
    notify 16711680 "Deploy Failed" "Runtime precheck failed (required services)"
    exit 1
fi

unhealthy=$(docker_compose ps --format json | grep -c '"unhealthy"' || true)
if [[ "$unhealthy" -gt 0 ]]; then
    log "ERROR: RUNTIME_PRECHECK_FAILED ($unhealthy unhealthy container(s))"
    print_targeted_logs
    notify 16711680 "Deploy Failed" "$unhealthy unhealthy container(s)"
    exit 1
fi

if ! wait_for_http_ready \
    "API health" \
    "http://nginx/api/health" \
    '"status"[[:space:]]*:[[:space:]]*"ok"'; then
    print_targeted_logs
    notify 16711680 "Deploy Failed" "API health endpoint did not become ready"
    exit 1
fi

if ! wait_for_http_ready \
    "Auth config health" \
    "http://nginx/api/health/auth-config" \
    '"auth"[[:space:]]*:'; then
    print_targeted_logs
    notify 16711680 "Deploy Failed" "Auth config health endpoint did not become ready"
    exit 1
fi

log "Pruning old images..."
docker image prune -f --filter "until=24h"

log "Deploy complete!"
notify 65280 "Deploy Successful" "All services healthy and running"
