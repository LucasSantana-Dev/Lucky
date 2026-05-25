# ADR: Async Deploy Completion Signal via GitHub Commit Statuses

**Date:** 2026-05-24  
**Status:** Accepted

## Context

`deploy-wrapper.sh` runs `nohup bash deploy.sh & disown` so the webhook HTTP response returns immediately. `deploy.sh` executes fully detached from the CI process.

The "Validate deployed version" step in `deploy.yml` handles two paths:

- **Rebuild path** (`docker_rebuilt=true`): polls `/api/health/version` for SHA match. Correct — the SHA changes when a new image is built, so HTTP 200 from the old container won't satisfy the check.
- **No-rebuild path** (`docker_rebuilt=false`): polled `/api/health` for HTTP 200. Incorrect — the already-running service returns 200 immediately, before `deploy.sh` has executed (git sync, container restart if needed, health checks). A `deploy.sh` failure is invisible to CI.

The no-rebuild path fires on every commit that does not change Docker-relevant files (e.g., config changes, bot logic, backend logic). This is the majority of deploys.

## Decision

Bridge the async gap using GitHub commit statuses (`context: homelab-deploy`), posted by `deploy.sh` directly to the GitHub Statuses API:

1. After a successful git sync, `deploy.sh` posts `pending` keyed to the post-sync HEAD SHA.
2. On exit (via an EXIT trap), `deploy.sh` posts `success` (happy path) or `failure` (any other exit).
3. CI polls `GET /repos/{owner}/{repo}/commits/{sha}/statuses` for the `homelab-deploy` context, using `GITHUB_TOKEN` (which has `statuses:read` via the `contents: read` job permission).

**Graceful degradation:** If `GITHUB_DEPLOY_STATUS_TOKEN` is absent from the homelab server environment, `post_deploy_status` is a no-op. CI detects no status after ~90 s (6 attempts × 15 s) and falls back to the original HTTP 200 health check. This preserves current behavior with zero breakage while the token is being configured.

## Alternatives Considered

**Keep HTTP 200 poll in no-rebuild path:** Simple, zero new infrastructure. Rejected because it creates a false-pass guarantee — a `deploy.sh` git-sync failure or container restart failure exits the script with a non-zero code that is never surfaced to the operator.

**Write deploy result to a file, have CI fetch it:** Requires the homelab server to expose a new endpoint or the CI to SSH into the homelab. Rejected — adds a network dependency and complicates the homelab surface. The GitHub Statuses API is already available and authenticated.

**Poll the deploy log via SSH:** Requires SSH access from CI runners to the homelab. Rejected — increases attack surface and deviates from the existing webhook-only interface.

**Add a callback webhook from deploy.sh to CI:** CI would need to receive inbound connections from the homelab. Rejected — GitHub Actions runners are ephemeral and do not have stable inbound addresses.

## Consequences

**Positive:**

- A `deploy.sh` failure on the no-rebuild path now causes the CI step to exit 1 within seconds of the failure being posted — not silently pass.
- Operators see the failure in the CI run, not later from user reports.
- The status mechanism reuses existing GitHub infrastructure; no new services required.

**Negative:**

- Requires a new `GITHUB_DEPLOY_STATUS_TOKEN` secret configured on the homelab webhook container (GitHub PAT, `repo:statuses` scope on `LucasSantana-Dev/Lucky`). Until configured, behavior degrades gracefully to the old HTTP 200 poll.
- `deploy.sh` gains a `curl` call per deploy. The call is fire-and-forget (`|| true`); a network failure does not abort the deploy.

**Neutral:**

- The 90 s fallback threshold is a one-time cost paid only when the token is not yet configured. Once the token is present, the loop exits on `success` or `failure` — typically within 15–30 s of `deploy.sh` completing.

## Revisit When

- The `GITHUB_DEPLOY_STATUS_TOKEN` token is rotated or revoked without updating the homelab environment (status posts will silently stop; CI will fall back to HTTP 200 poll — same as before, but masked). Add a monitoring alert if status posts stop appearing on deploys.
- `deploy.sh` is split into multiple async stages; each stage would need its own status post.
- Discord-rate-limit or GitHub API outage causes the `gh api` status poll to fail consistently; the 20-attempt cap (5 min) bounds the worst case.
