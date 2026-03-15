# CI/CD Pipeline

This document describes the continuous integration and deployment setup for Lucky.

## Overview

- **CI**: Runs on every push and pull request to `main` and `develop`. Two jobs: **Quality Gates** (lint, type-check, build, unit/integration tests, coverage, security audit) and **E2E** (Playwright tests for the frontend), with E2E depending on Quality Gates.
- **CD**: Deploy workflow runs on push to `main` (and manual trigger). It calls a protected homelab webhook that performs pull/build/restart.

## Lock file

The root `package-lock.json` must be committed. CI uses `cache: 'npm'` and `npm ci`, which require it. Do not add it to `.gitignore`.

## Pre-commit hooks (Husky)

Before each commit the following run automatically:

1. **lint-staged**: ESLint (with autofix), Prettier, and Secretlint on staged files. Secretlint scans for credentials (AWS/GCP/GitHub tokens, private keys, etc.); commit is blocked if a secret is detected.
2. **audit:critical**: `npm audit --audit-level=critical` — commit is blocked only if critical vulnerabilities exist. High-severity issues are still reported in CI (Quality Gates).

**Commit message**: The `commit-msg` hook runs Commitlint (Angular conventional commits). Subject must use a valid type (`feat`, `fix`, `docs`, etc.), lower-case, no trailing period, max 72 characters.

To bypass hooks (use sparingly): `git commit --no-verify`.

## CI jobs

### Quality Gates

1. Checkout, Node 22, `npm ci` (with cache).
2. **Lint**: `npm run lint` (root ESLint).
3. **Type check**: `npm run type:check` (shared, bot, backend, frontend).
4. **Build**: `npm run build` (shared, bot, backend, frontend).
5. **Tests**: `npm run test:ci` (backend Jest, unit + integration).
6. **Coverage**: `npm run test:coverage` (backend; enforces thresholds, outputs `packages/backend/coverage/`).
7. **Security**: `npm audit --audit-level high`.
8. **Secrets scan**: `npm run lint:secrets` (Secretlint on full codebase; blocks PRs that introduce credentials).
9. **Outdated**: `npm run check:outdated` (informational; does not fail).
10. **Codecov**: Uploads `packages/backend/coverage/lcov.info`.

### E2E (Playwright)

Runs after Quality Gates succeed:

1. Checkout, Node 22, `npm ci`.
2. Install Playwright Chromium: `cd packages/frontend && npx playwright install --with-deps chromium`.
3. Run E2E: `npm run test:e2e` (starts frontend dev server and runs Playwright tests).

## Deployment

The deploy workflow (`.github/workflows/deploy.yml`) runs on push to `main` and on
manual dispatch. It:

1. Validates `DEPLOY_WEBHOOK_SECRET` and `DEPLOY_WEBHOOK_URL`.
2. Normalizes deploy webhook candidates from `DEPLOY_WEBHOOK_URL` (URL-parse +
   canonical `/webhook/deploy`) and de-duplicates retries.
3. Sends a signed POST request with retry/backoff across normalized candidates.
4. Verifies OAuth auth-config contract health with retry and classifies failures
   as `upstream unavailable (5xx)` vs `contract invalid/unready (200 + bad body)`.
5. Verifies OAuth redirect contract (`/api/auth/discord` 302 redirect shape).
6. Fails the job with a triage-ready summary when readiness never converges.

Required GitHub secrets: `DEPLOY_WEBHOOK_SECRET`, `DEPLOY_WEBHOOK_URL`.

`DEPLOY_WEBHOOK_URL` should point to the webhook route exposed by nginx:

```text
https://<your-domain>/webhook/deploy
```

If the configured URL is missing the deploy path, the workflow appends
`/webhook/deploy` as a canonical retry candidate. Candidate generation is
de-duplicated, so it will never retry with malformed paths such as
`/webhook/deploy/webhook/deploy`.

Deploy webhook runtime (`scripts/deploy.sh`) now blocks rollout before restarting
services unless all database preconditions pass:

1. `npx prisma migrate deploy`
2. `npx prisma migrate status`
3. required relation guard
   (`guild_role_grants`, `guild_automation_manifests`,
   `guild_automation_runs`, `guild_automation_drifts`)

If any pre-rollout DB guard fails, deploy exits immediately with a classified
migration/schema error and runtime services are not restarted.

### Deploy secrets (how to add)

Add these repository secrets in **Settings → Secrets and variables → Actions**:

| Secret                    | Description                                                              |
| ------------------------- | ------------------------------------------------------------------------ |
| `DEPLOY_WEBHOOK_SECRET`   | Shared secret validated by `scripts/deploy.sh`                           |
| `DEPLOY_WEBHOOK_URL`      | Public deploy endpoint (`https://<domain>/webhook/deploy`)               |
| `DISCORD_DEPLOY_WEBHOOK`  | Optional Discord webhook URL for deploy start/success/failure embeds     |

#### One-time setup via GitHub CLI

From the repo root, with [GitHub CLI](https://cli.github.com/) installed and authenticated (`gh auth login`):

```bash
gh secret set DEPLOY_WEBHOOK_SECRET --body "your-random-secret"
gh secret set DEPLOY_WEBHOOK_URL --body "https://lucky.lucassantana.tech/webhook/deploy"
```

#### Discord deploy notifications (optional)

Set `DISCORD_DEPLOY_WEBHOOK` on the homelab host to receive rich Discord embeds for every deploy lifecycle event (started, succeeded, failed, skipped).

1. In your Discord server, go to **Server Settings → Integrations → Webhooks → New Webhook**.
2. Select the channel and copy the webhook URL.
3. On the homelab host, add the variable to `.env` (same directory as `docker-compose.yml`):

```bash
echo 'DISCORD_DEPLOY_WEBHOOK=https://discord.com/api/webhooks/<id>/<token>' >> /home/luk-server/Lucky/.env
```

4. Restart the webhook container to pick up the new variable:

```bash
docker compose up -d webhook
```

The `notify()` function in `scripts/deploy.sh` uses this variable and silently skips notifications when it is unset.

#### Manual no-SSH trigger from local machine

```bash
./scripts/deploy-remote.sh main
# or
npm run deploy:homelab
```

This dispatches `Deploy to Homelab`, waits for completion, and prints failed logs.

### Deploy webhook 405 troubleshooting

If `Deploy to Homelab` fails with `405 Not Allowed`:

1. Validate endpoint from your machine:
   `curl -i -X POST https://<domain>/webhook/deploy`
2. If the response is frontend HTML, your running nginx image does not include webhook routing yet.
3. Run one bootstrap deploy on the homelab host to update nginx/webhook services:
   `docker compose up -d --remove-orphans nginx webhook`
4. Re-run `npm run deploy:homelab`.

After this bootstrap, future deploys run without SSH through GitHub Actions.

### Deploy webhook DNS troubleshooting

If deploy fails with curl exit code `6` (Could not resolve host):

1. Confirm `DEPLOY_WEBHOOK_URL` points to an existing DNS host (Lucky):
    - `gh secret set DEPLOY_WEBHOOK_URL --body "https://lucky.lucassantana.tech/webhook/deploy"`
2. Ensure Cloudflare DNS has `lucky.lucassantana.tech` published to the active tunnel.
3. Verify from any machine:
    - `curl -i -X POST https://lucky.lucassantana.tech/webhook/deploy`
4. Re-run:
    - `npm run deploy:homelab`

### Deploy webhook stability troubleshooting

If deploy trigger fails with `502` and nginx logs show `host not found in
upstream "webhook"`:

1. Confirm webhook container is running:
   - `docker compose ps webhook`
2. Confirm service discovery from nginx:
   - `docker exec lucky-nginx getent hosts webhook backend frontend`
3. Restart only webhook if needed:
   - `docker compose up -d webhook`
4. Check recent logs:
   - `docker compose logs --tail=200 --no-color webhook nginx`

To reduce recurrence, deploy rollout now restarts target services with
`--no-deps`, and nginx no longer depends on webhook service startup.
Webhook-side readiness checks use `curl` when available and fall back to
BusyBox `wget` otherwise, so the deploy container does not require a separate
`curl` install to validate `/api/health` and `/api/health/auth-config`.

### Cloudflared config directory

Set `CLOUDFLARED_CONFIG_DIR` explicitly on the deploy host so tunnel restarts do
not depend on shell `$HOME` resolution.

Recommended production value:

```bash
CLOUDFLARED_CONFIG_DIR=/home/luk-server/.cloudflared
```

Required files in that directory:

- `config-lucky.yml`
- tunnel credentials JSON referenced by `credentials-file` inside
  `config-lucky.yml`

Quick validation commands on host:

```bash
ls -la "$CLOUDFLARED_CONFIG_DIR"
test -f "$CLOUDFLARED_CONFIG_DIR/config-lucky.yml"
awk -F': ' '/^credentials-file:/ {print $2}' "$CLOUDFLARED_CONFIG_DIR/config-lucky.yml"
```

If deploy context differs from login shell context, this explicit variable
prevents mount drift between paths like `/home/<user>/.cloudflared` and
`/root/.cloudflared`.

### Deploy smoke `502` troubleshooting

If `Auth config smoke check` times out with repeated `HTTP 502`:

1. Treat this as upstream backend/nginx availability, not OAuth contract shape.
2. Trigger deploy again with:
   - `npm run deploy:homelab`
3. Inspect run logs for:
   - `upstream unavailable` counters in `Auth config smoke summary`
   - deploy-side service/log diagnostics from `scripts/deploy.sh`
4. Confirm public probes recover:
    - `https://lucky.lucassantana.tech/api/health` -> `200`
    - `https://lucky.lucassantana.tech/api/health/auth-config` -> `200`
    - `https://lucky.lucassantana.tech/api/auth/discord` -> `302`

**Recommendation**: Configure branch protection for `main` so that the CI workflow must pass before merge. Deploy then runs only when CI has already succeeded.

### Deploy smoke 502 troubleshooting (backend crash-loop)

If deploy webhook succeeds but smoke checks keep returning `502` on
`/api/health/auth-config`, run:

```bash
./scripts/homelab-diagnostics.sh server-do-luk
```

The diagnostics output is sanitized and includes:

1. Lucky container status
2. `lucky-backend` log tail
3. Local/public auth health checks
4. Public OAuth redirect check

If backend logs show:

```text
ERR_PACKAGE_PATH_NOT_EXPORTED
```

you likely have a package export-map mismatch between `@lucky/shared` and a
deep backend import path. Ship a hotfix that updates `packages/shared` exports
and verify with:

```bash
npm run build:shared
npm run verify:shared-exports
```

## Local parity

To mimic CI locally:

```bash
npm ci
npm run lint
npm run type:check
npm run build
npm run test:ci
npm run test:coverage
npm run audit:high
```

For E2E (from repo root, with frontend deps and Playwright browsers installed):

```bash
cd packages/frontend && npx playwright install --with-deps chromium && cd ../..
npm run test:e2e
```

See [TESTING.md](TESTING.md) for detailed test commands and structure.
