---
name: lucky-deploy-recovery
description: Recover Lucky when workflow checks pass but production stays stale, webhook deploys fail, or deploy signaling is inconsistent.
---

# Lucky Deploy Recovery

## When to use

- GitHub deploy workflow is green but production revision is old
- Webhook returns success while deploy command failed (or never started)
- Deploys fail on missing compose secrets, lock collisions, or stale runtime drift

## Recovery workflow

1. Capture baseline

- `git rev-parse --short HEAD`
- `git rev-parse --short origin/main`
- container revisions from `org.opencontainers.image.revision` for backend/bot/frontend/nginx

2. Repair deploy prerequisites

- restore/confirm required `.env` values, especially `POSTGRES_PASSWORD` and `DEPLOY_WEBHOOK_SECRET`
- run compose preflight before deploy:
    - `docker compose --project-directory /home/luk-server/Lucky --env-file /home/luk-server/Lucky/.env config`

3. Harden webhook signaling

- in `deploy/hooks.json`, keep:
    - `include-command-output-in-response: true`
    - `include-command-output-in-response-on-error: true`
- remove webhook `-verbose` runtime flag from `docker-compose.yml`
- rotate `DEPLOY_WEBHOOK_SECRET` when compromise/drift is suspected and sync with GitHub secret
- align deploy workflow trigger behavior with synchronous webhook execution:
    - webhook trigger curl `--max-time` must cover full deploy runtime
    - retries should be transport-only (`HTTP 000`) to avoid duplicate deploy launches
    - set deploy workflow `concurrency` to serialize overlapping `workflow_run` + `workflow_dispatch` deploys

4. Redeploy and validate

- pull latest: `git pull --ff-only origin main`
- run deploy script with explicit env context
- verify containers are healthy and smoke endpoints pass:
    - `/api/health`, `/api/health/auth-config`, `/api/auth/discord`, `/install`, `/legal`, `/discovery`

5. Verify outcome, not just workflow status

- compare running image revisions to intended deploy target
- if webhook tests are noisy due edge timeouts, re-test directly against webhook container IP (`:9000/hooks/deploy`) to confirm true command outcome

## Incident guardrails

- Treat concurrent deploy agents as a blocker; wait for a quiet window before mutation steps.
- Preserve evidence (`curl` bodies/status codes, deploy output snippets, container revision checks) in handoff notes.
- If lock file PID is stale/reused, validate process command line before honoring lock ownership.
- If lock PID file is momentarily missing, do not immediately clear lock; treat fresh lock directories as active to avoid race-induced dual deploys.
