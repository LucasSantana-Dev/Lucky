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
2. Sends a signed POST request to the deploy webhook endpoint.
3. If the first URL responds with `405`, retries with `/webhook/deploy`.
4. Fails the job on any non-2xx response.

Required GitHub secrets: `DEPLOY_WEBHOOK_SECRET`, `DEPLOY_WEBHOOK_URL`.

`DEPLOY_WEBHOOK_URL` should point to the webhook route exposed by nginx:

```text
https://<your-domain>/webhook/deploy
```

If the configured URL returns HTTP 405, the workflow retries once with `/webhook/deploy`.

### Deploy secrets (how to add)

Add these repository secrets in **Settings → Secrets and variables → Actions**:

| Secret                  | Description                                                |
| ----------------------- | ---------------------------------------------------------- |
| `DEPLOY_WEBHOOK_SECRET` | Shared secret validated by `scripts/deploy.sh`             |
| `DEPLOY_WEBHOOK_URL`    | Public deploy endpoint (`https://<domain>/webhook/deploy`) |

#### One-time setup via GitHub CLI

From the repo root, with [GitHub CLI](https://cli.github.com/) installed and authenticated (`gh auth login`):

```bash
gh secret set DEPLOY_WEBHOOK_SECRET --body "your-random-secret"
gh secret set DEPLOY_WEBHOOK_URL --body "https://lucky.lucassantana.tech/webhook/deploy"
```

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

**Recommendation**: Configure branch protection for `main` so that the CI workflow must pass before merge. Deploy then runs only when CI has already succeeded.

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
