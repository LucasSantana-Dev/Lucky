#!/usr/bin/env bash
set -euo pipefail

host="${1:-server-do-luk}"
deploy_dir="${2:-/home/luk-server/Lucky}"

ssh_opts=(
    -o BatchMode=yes
    -o ConnectTimeout=10
    -o StrictHostKeyChecking=accept-new
)

redact() {
    sed -E \
        -e 's/(DISCORD_TOKEN|CLIENT_SECRET|WEBAPP_SESSION_SECRET|POSTGRES_PASSWORD|DEPLOY_WEBHOOK_SECRET)=([^[:space:]]+)/\1=[REDACTED]/g' \
        -e 's/(Bearer )[A-Za-z0-9._-]+/\1[REDACTED]/g'
}

ssh "${ssh_opts[@]}" "$host" "set -euo pipefail
echo \"HOST:\$(hostname)\"
echo \"DATE:\$(date -Is)\"
echo
echo \"== docker ps (Lucky) ==\"
docker ps --filter 'name=lucky-' --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}'
echo
echo \"== compose ps (Lucky stack) ==\"
docker compose --project-directory '$deploy_dir' -p lucky ps || true
echo
echo \"== lucky-backend logs (tail 120) ==\"
docker logs --tail 120 lucky-backend 2>&1 || true
echo
echo \"== local auth health ==\"
curl -sS -m 8 -i http://127.0.0.1:3000/api/health/auth-config || true
echo
echo \"== public auth health ==\"
curl -sS -m 12 -i https://lucky-api.lucassantana.tech/api/health/auth-config || true
echo
echo \"== public oauth redirect ==\"
curl -sS -m 12 -i https://lucky-api.lucassantana.tech/api/auth/discord || true
" | redact
