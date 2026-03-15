---
name: deploy-homelab
description: Debug and manage Lucky homelab deployments. Use when deploy workflow fails, webhook returns errors, or containers need recovery on the homelab server.
---

# Lucky Deploy to Homelab

## When to use

- Deploy workflow fails in GitHub Actions
- Webhook returns HTTP 500, 502, or 000 (timeout)
- Need to manually deploy or recover containers on homelab
- Investigating deploy lock contention or script failures

## Architecture

```
GitHub Actions (deploy.yml)
  -> curl POST -> Cloudflare tunnel
                    -> nginx:80
                        -> /webhook/* -> webhook:9000 (almir/webhook)
                                          -> deploy-wrapper.sh (async)
                                                -> deploy.sh (nohup background)
```

## Key files

| File | Purpose |
|------|---------|
| `.github/workflows/deploy.yml` | CI workflow: triggers on CI/CD Pipeline success on main or workflow_dispatch |
| `scripts/deploy-wrapper.sh` | Async launcher: nohup starts deploy.sh, returns immediately |
| `scripts/deploy.sh` | Full deploy: git pull, docker compose build, migrations, health checks, Discord notify |
| `deploy/hooks.json` | Webhook binary config: points to deploy-wrapper.sh |
| `deploy/Dockerfile` | Webhook container image (almir/webhook + git + docker-cli + compose) |
| `docker-compose.yml` | Production compose with 8 services |

## Common failure patterns

### HTTP 000 (timeout)
- **Old cause**: deploy.yml had `--max-time 20` but deploy takes 3-5 min and webhook blocked. Fixed by async wrapper.
- **Current**: `--max-time 30` with wrapper returning in <1s. If still 000, check Cloudflare tunnel or nginx.

### HTTP 500 empty body
- **Cause**: `deploy.sh` not executable (mode 100644). Webhook can't execute it.
- **Fix**: `git update-index --chmod=+x scripts/deploy.sh`

### HTTP 500 LOCK_CONTENTION
- **Cause**: Another deploy is already running. Deploy.sh uses flock at `/tmp/lucky-deploy.lock`.
- **Fix**: Wait for current deploy to finish, or remove lock: `docker exec lucky-webhook rm -f /tmp/lucky-deploy.lock`

### HTTP 502 Bad Gateway
- **Cause**: nginx can't reach webhook container. Check if webhook is running.
- **Fix**: `docker compose restart webhook`

## SSH access

```bash
# Via Tailscale
ssh luk-server@100.95.204.103

# Check containers
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'

# Check deploy logs
docker exec lucky-webhook cat /tmp/lucky-deploy.log

# Manual deploy (bypasses webhook)
docker exec lucky-webhook bash /home/luk-server/Lucky/scripts/deploy.sh "$DEPLOY_WEBHOOK_SECRET"

# Check file permissions
docker exec lucky-webhook ls -la /home/luk-server/Lucky/scripts/deploy*.sh
```

## Deploy workflow triggers

- **Automatic**: `workflow_run` after CI/CD Pipeline completes on main
- **Manual**: `workflow_dispatch` from Actions tab or `gh workflow run deploy.yml`

## Smoke checks (after deploy)

```bash
# Internal (from homelab)
docker exec lucky-nginx curl -s http://lucky-backend:3000/api/health
docker exec lucky-nginx curl -s http://lucky-backend:3000/api/health/auth-config

# External
curl -s https://lucky.lucassantana.tech/api/health
curl -s https://lucky.lucassantana.tech/api/health/auth-config
```

## Docker services

| Container | Port | Notes |
|-----------|------|-------|
| lucky-backend | 3000 (internal) | Express API, no host port mapping |
| lucky-bot | - | Discord.js bot |
| lucky-frontend | 80 (internal) | React SPA |
| lucky-nginx | 80 (host) | Reverse proxy |
| lucky-postgres | 5432 | PostgreSQL |
| lucky-redis | 6379 | Redis |
| lucky-tunnel | - | Cloudflare tunnel |
| lucky-webhook | 9000 (internal) | almir/webhook, no host port |

## Gotchas

- Backend listens on port 3000 inside container, NOT 3001. No host port mapping.
- Webhook container has no host port mapping -- traffic only via nginx.
- `deploy.sh` must be `100755` in git. PRs that touch it can accidentally change mode.
- `deploy-wrapper.sh` uses nohup -- deploy logs go to `/tmp/lucky-deploy.log` inside webhook container.
- Nginx rewrites `/webhook/(.*)` to `/hooks/$1` before proxying to webhook:9000.
