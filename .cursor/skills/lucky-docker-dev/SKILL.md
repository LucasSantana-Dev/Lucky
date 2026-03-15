---
name: lucky-docker-dev
description: Run and test Lucky with Docker. Use when changing docker-compose, Dockerfiles, or local dev/CI runs.
---

# Lucky Docker + Deploy Validation

## When to use

- Changing `docker-compose.yml`, `docker-compose.dev.yml`, Dockerfiles, or `scripts/deploy.sh`
- Deploy verification when webhook/CI looks healthy but runtime is stale
- Troubleshooting env/secret resolution issues in containerized runs

## Production preflight (required)

1. Resolve required compose vars before deploy:
    - ensure `.env` has non-empty required values (especially `POSTGRES_PASSWORD`, `DEPLOY_WEBHOOK_SECRET`)
2. Validate compose rendering before pull/build:
    - `docker compose --project-directory /home/luk-server/Lucky --env-file /home/luk-server/Lucky/.env config`
3. If preflight fails, stop and fix env first. Do not continue to pull/deploy.

## Deploy + revision checks

1. Sync repo and deploy:
    - `git pull --ff-only origin main`
    - `DEPLOY_WEBHOOK_SECRET=... DEPLOY_DIR=/home/luk-server/Lucky COMPOSE_WORKDIR=/home/luk-server/Lucky ./scripts/deploy.sh "$DEPLOY_WEBHOOK_SECRET"`
2. Verify runtime revision after rollout:
    - `git rev-parse --short HEAD`
    - `docker image inspect -f '{{ index .Config.Labels "org.opencontainers.image.revision" }}' $(docker inspect -f '{{.Image}}' lucky-backend)`
    - repeat for `lucky-bot`, `lucky-frontend`, `lucky-nginx`
3. Verify smoke contracts:
    - `/api/health` -> `200` and `"status":"ok"`
    - `/api/health/auth-config` -> `200` and auth payload
    - `/api/auth/discord` -> `302` redirect to Discord OAuth URL
    - frontend routes `/install`, `/legal`, `/discovery` -> `200`

## Webhook failure-signaling checks

1. `deploy/hooks.json` must keep:
    - `include-command-output-in-response: true`
    - `include-command-output-in-response-on-error: true`
2. Webhook service command should avoid verbose request logging (`-verbose` removed).
3. Validation:
    - wrong secret request -> non-2xx with explicit error
    - correct secret request -> waits for deploy command completion and returns command output
4. If proxy timeout interferes, test direct webhook endpoint via container IP (`http://<webhook-ip>:9000/hooks/deploy`) to isolate signaling from edge timeouts.
5. Deploy uses async wrapper (`deploy-wrapper.sh`) that returns immediately while `deploy.sh` runs in background via nohup:
    - Webhook responds in <1s, so CI curl timeout (30s) is sufficient
    - Deploy logs go to `/tmp/lucky-deploy.log` inside webhook container
    - Lock contention is still possible if a previous deploy is still running
    - For detailed deploy debugging, see the `deploy-homelab` skill
