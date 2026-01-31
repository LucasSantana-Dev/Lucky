# CI/CD Pipeline

This document describes the continuous integration and deployment setup for LukBot.

## Overview

- **CI**: Runs on every push and pull request to `main` and `develop`. Two jobs: **Quality Gates** (lint, type-check, build, unit/integration tests, coverage, security audit) and **E2E** (Playwright tests for the frontend), with E2E depending on Quality Gates.
- **CD**: Deploy workflow runs on push to `main` (and manual trigger). Deploys via SSH to the target server: pull, Docker build, restart services.

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

The deploy workflow (`.github/workflows/deploy.yml`) runs on push to `main` and on manual dispatch. It:

1. Checks out the repo.
2. Uses `webfactory/ssh-agent` with `SSH_PRIVATE_KEY`.
3. SSHs to the server (`SSH_USER`@`SSH_HOST`), then:
    - `cd /home/luk-server/LukBot`
    - `git pull origin main`
    - `docker build -t lukbot:latest .`
    - `./scripts/discord-bot.sh stop` then `./scripts/discord-bot.sh start`
    - `./scripts/discord-bot.sh status`

Required GitHub secrets: `SSH_PRIVATE_KEY`, `SSH_USER`, `SSH_HOST`. If any are missing, the deploy job fails at "Check deploy secrets" with the list of missing names.

### Deploy secrets (how to add)

GitHub Actions runs in the cloud and cannot use your local SSH config. Add these repository secrets in **Settings → Secrets and variables → Actions**:

| Secret            | Description                                                                                                                                                                             |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SSH_PRIVATE_KEY` | Full contents of the private key file (e.g. `~/.ssh/id_ed25519` or the key used for your server). Paste the whole file including `-----BEGIN ... KEY-----` and `-----END ... KEY-----`. |
| `SSH_USER`        | SSH login user (e.g. `luk-server` or `root`).                                                                                                                                           |
| `SSH_HOST`        | Server hostname or IP.                                                                                                                                                                  |

If you use a host alias locally (e.g. `server-do-luk` in `~/.ssh/config`), you can get user and host with:

```bash
ssh -G server-do-luk | grep -E '^user |^hostname '
```

Use that user and hostname as `SSH_USER` and `SSH_HOST`. For `SSH_PRIVATE_KEY`, use the key file path from your config (`IdentityFile`) and paste its contents into the secret.

#### One-time setup via GitHub CLI

From the repo root, with [GitHub CLI](https://cli.github.com/) installed and authenticated (`gh auth login`):

```bash
gh secret set SSH_USER --body "luk-server"
gh secret set SSH_HOST --body "100.95.204.103"
gh secret set SSH_PRIVATE_KEY < ~/.ssh/YOUR_KEY_FILE
```

Replace `YOUR_KEY_FILE` with the key you use for the server. SSH lists default paths in order (`ssh -G server-do-luk | grep identityfile`); use the first one that exists on your machine (e.g. `id_ed25519` or `id_rsa`). To see which private keys you have:

```bash
ls ~/.ssh/id_* 2>/dev/null | grep -v '.pub'
```

Then set the secret (example for `id_ed25519`):

```bash
gh secret set SSH_PRIVATE_KEY < ~/.ssh/id_ed25519
```

If `gh` reports an invalid token, run `gh auth login` and try again.

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
