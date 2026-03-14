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

env_file_value() {
    local key="$1"
    local env_file="$2"

    [[ -f "$env_file" ]] || return 1

    awk -F= -v target="$key" '
        $1 == target {
            print substr($0, index($0, "=") + 1)
            exit
        }
    ' "$env_file"
}

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
                        \"value\": \"\`$commit_sha\` $commit_msg\",
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
    local value
    value="$(env_file_value "POSTGRES_PASSWORD" "$env_file" || true)"
    if [[ -n "$value" ]]; then
        echo "$value"
        return
    fi

    echo ""
}

collect_required_compose_vars() {
    local compose_file="$COMPOSE_WORKDIR/docker-compose.yml"
    [[ -f "$compose_file" ]] || return 0

    grep -oE '\$\{[A-Z0-9_]+\?[^}]*\}' "$compose_file" \
        | sed -E 's/^\$\{([A-Z0-9_]+)\?.*/\1/' \
        | sort -u
}

require_compose_env_vars() {
    local env_file="$COMPOSE_WORKDIR/.env"
    local missing=()
    local key value
    local required=()

    mapfile -t required < <(collect_required_compose_vars)

    for key in "${required[@]}"; do
        value="${!key:-}"
        if [[ -z "$value" ]]; then
            value="$(env_file_value "$key" "$env_file" || true)"
        fi

        if [[ -z "$value" ]]; then
            missing+=("$key")
            continue
        fi

        export "$key=$value"
    done

    if [[ "${#missing[@]}" -gt 0 ]]; then
        log "ERROR: required compose env vars missing: ${missing[*]}"
        notify 16711680 "Deploy Failed" "Missing required compose env vars: ${missing[*]}"
        return 1
    fi

    return 0
}

run_compose_preflight() {
    log "Running compose preflight..."
    if ! docker_compose config >/dev/null; then
        log "ERROR: docker compose preflight failed (invalid config or unresolved vars)"
        notify 16711680 "Deploy Failed" "Compose preflight failed"
        return 1
    fi
    log "Compose preflight passed"
    return 0
}

resolve_healthcheck_base_url() {
    if [[ -n "${HEALTHCHECK_BASE_URL:-}" ]]; then
        echo "${HEALTHCHECK_BASE_URL%/}"
        return
    fi

    if getent hosts nginx >/dev/null 2>&1; then
        echo "http://nginx"
        return
    fi

    local mapped_port
    mapped_port="$(docker port lucky-nginx 80/tcp 2>/dev/null | head -n1 | awk -F: '{print $NF}')"
    if [[ -n "$mapped_port" ]]; then
        echo "http://127.0.0.1:$mapped_port"
        return
    fi

    if [[ -n "${WEBAPP_BACKEND_URL:-}" ]]; then
        echo "${WEBAPP_BACKEND_URL%/}"
        return
    fi

    local env_file="$COMPOSE_WORKDIR/.env"
    local configured_port
    configured_port="$(env_file_value "NGINX_PORT" "$env_file" || true)"
    if [[ -n "$configured_port" ]]; then
        echo "http://127.0.0.1:$configured_port"
        return
    fi

    echo "http://127.0.0.1:8080"
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
        local existing_cmd
        existing_cmd=$(ps -p "$existing_pid" -o args= 2>/dev/null || true)
        if echo "$existing_cmd" | grep -Eq '(^|[[:space:]])(deploy\.sh|/scripts/deploy\.sh)([[:space:]]|$)'; then
            return 1
        fi
    fi

    rm -rf "$LOCK_DIR" 2>/dev/null || true
    mkdir "$LOCK_DIR" 2>/dev/null || return 1
    echo "$$" >"$LOCK_PID_FILE"
    return 0
}

fail_if_git_dirty() {
    local dirty
    dirty=$(git -C "$DEPLOY_DIR" status --porcelain --untracked-files=no || true)

    if [[ -z "$dirty" ]]; then
        return 0
    fi

    log "ERROR: working tree has tracked local changes; refusing deploy pull"
    while IFS= read -r entry; do
        [[ -z "$entry" ]] && continue
        log "DIRTY: $entry"
    done <<<"$dirty"
    log "ERROR: remediate by committing/stashing/discarding local changes, then rerun deploy"
    notify 16711680 "Deploy Failed" "Dirty working tree blocks deploy pull"
    return 1
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
    log "ERROR: another deploy is already running"
    notify 16711680 "Deploy Skipped" "Another deploy is already in progress"
    exit 1
fi
trap 'rm -rf "$LOCK_DIR" 2>/dev/null || true' EXIT

COMPOSE_WORKDIR="$(resolve_compose_workdir)"
CLOUDFLARED_CONFIG_DIR="$(resolve_cloudflared_config_dir)"

if ! require_compose_env_vars; then
    exit 1
fi

if ! run_compose_preflight; then
    exit 1
fi

POSTGRES_PASSWORD_EFFECTIVE="${POSTGRES_PASSWORD:-}"
if [[ -z "$POSTGRES_PASSWORD_EFFECTIVE" ]]; then
    POSTGRES_PASSWORD_EFFECTIVE="$(resolve_postgres_password)"
fi

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

log "Pulling latest changes..."
if ! fail_if_git_dirty; then
    exit 1
fi
git pull --ff-only origin main

log "Pulling images..."
if ! docker_compose pull bot backend frontend nginx; then
    log "WARN: Pull failed, falling back to local build..."
    if ! docker_compose build --parallel bot backend frontend nginx; then
        notify 16711680 "Deploy Failed" "Docker build failed"
        exit 1
    fi
fi

log "Starting database services..."
docker_compose up -d postgres redis

log "Running database migrations..."
if ! docker_compose run --rm --no-deps backend \
    sh -lc "npx prisma migrate deploy --config prisma/prisma.config.ts --schema prisma/schema.prisma"; then
    log "ERROR: prisma migrate deploy failed (migration execution error)"
    notify 16711680 "Deploy Failed" "Database migration failed"
    exit 1
fi

log "Checking migration status..."
if ! docker_compose run --rm --no-deps backend \
    sh -lc "npx prisma migrate status --config prisma/prisma.config.ts --schema prisma/schema.prisma"; then
    log "ERROR: prisma migrate status failed (migration drift/history mismatch)"
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
    log "ERROR: required database relation verification failed (schema drift)"
    notify 16711680 "Deploy Failed" "Database relation guard failed"
    exit 1
fi

log "Rolling out services..."
docker_compose up -d --remove-orphans --no-deps bot backend frontend nginx postgres redis

if ! verify_cloudflared_config "$CLOUDFLARED_CONFIG_DIR"; then
    print_targeted_logs
    notify 16711680 "Deploy Failed" "Cloudflare tunnel config is invalid"
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

HEALTHCHECK_BASE_URL="$(resolve_healthcheck_base_url)"
log "Using healthcheck base URL: $HEALTHCHECK_BASE_URL"

if ! require_running_containers; then
    print_targeted_logs
    notify 16711680 "Deploy Failed" "Required services are missing or not running"
    exit 1
fi

unhealthy=$(docker_compose ps --format json | grep -c '"unhealthy"' || true)
if [[ "$unhealthy" -gt 0 ]]; then
    log "ERROR: $unhealthy unhealthy container(s)"
    print_targeted_logs
    notify 16711680 "Deploy Failed" "$unhealthy unhealthy container(s)"
    exit 1
fi

if ! wait_for_http_ready \
    "API health" \
    "$HEALTHCHECK_BASE_URL/api/health" \
    '"status"[[:space:]]*:[[:space:]]*"ok"'; then
    print_targeted_logs
    notify 16711680 "Deploy Failed" "API health endpoint did not become ready"
    exit 1
fi

if ! wait_for_http_ready \
    "Auth config health" \
    "$HEALTHCHECK_BASE_URL/api/health/auth-config" \
    '"auth"[[:space:]]*:'; then
    print_targeted_logs
    notify 16711680 "Deploy Failed" "Auth config health endpoint did not become ready"
    exit 1
fi

log "Pruning old images..."
docker image prune -f --filter "until=24h"

log "Deploy complete!"
notify 65280 "Deploy Successful" "All services healthy and running"
