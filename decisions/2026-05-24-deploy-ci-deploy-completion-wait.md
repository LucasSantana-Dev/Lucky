# Deploy CI: wait for homelab deploy completion on `docker_rebuilt=true` path

Date: 2026-05-24

## Context

The Lucky CI deploy pipeline fires via `workflow_run` after Docker images are published. The
webhook handler runs `deploy.sh` asynchronously (`nohup ... & disown`), so the webhook
returns before `deploy.sh` completes.

Gap B (PR #1046) added commit status posting to `deploy.sh`: it posts `pending` on sync,
then `success` or `failure` to the `homelab-deploy` GitHub commit status context on exit.

CI's "Validate deployed version" step has two paths:

- `docker_rebuilt=false` (no image rebuild): already polls `homelab-deploy` commit status,
  waits for `success`/`failure`, and exits accordingly.
- `docker_rebuilt=true` (image rebuilt): polls `/api/health/version` for SHA match and exits
  0 on match — but does not wait for `deploy.sh` to complete.

The race window: `/api/health/version` can return the new SHA as soon as the backend
container restarts. But `deploy.sh` continues executing (bot health poll, up to 90s). If
the bot health gate fails after CI sees the SHA match, CI marks the deploy step green while
`deploy.sh` exits non-zero and posts `failure` to `homelab-deploy`. Signals diverge.

## Decision

Add a "Wait for homelab deploy completion" step after all smoke checks, conditioned on
`docker_rebuilt=true`. The step polls the `homelab-deploy` commit status using `gh api`
for up to 3 minutes (12 × 15s). Outcomes:

- `success` → CI passes.
- `failure`/`error` → CI fails with an explicit error.
- No status seen after 90s → warn and proceed (`GITHUB_DEPLOY_STATUS_TOKEN` not configured on
  homelab; cannot confirm full completion — accepted degraded mode).
- Timeout (3 min) → warn and proceed (bot health gate is warn-on-timeout by design; Discord
  notification carries the authoritative outcome).

The `docker_rebuilt=false` path is unaffected — it already has equivalent logic in "Validate
deployed version".

## Alternatives considered

**Do nothing (accept + document)** — Bot health gate is warn-on-timeout by design; SHA match
and smoke checks are strong signals. Discord notification tells the operator about bot health.
Rejected: an operator reading "CI green" after a deploy with a divergent `homelab-deploy:
failure` status has to cross-check two systems to understand deploy outcome. Confusion is
real and bounded (~90s race window but repeatable).

**Make webhook synchronous** — Remove `nohup ... & disown` from `deploy-wrapper.sh`; webhook
blocks until `deploy.sh` completes. True exit code reaches CI. Rejected: adds 3–5 min to
webhook response time; homelab nginx timeout risk; requires deploy-wrapper redesign.

**Fail CI on missing `GITHUB_DEPLOY_STATUS_TOKEN`** — Hard-fail the step if no status appears
after 90s. Rejected: inconsistent with the `docker_rebuilt=false` path, which also falls
back gracefully when the token is absent. A missing token means the feature is disabled, not
that the deploy failed.

## Consequences

**Positive:**

- CI outcome on `docker_rebuilt=true` now reflects the full deploy cycle, including bot health
  gate, not just SHA publication.
- Consistent behavior between `docker_rebuilt=true` and `docker_rebuilt=false` paths: both
  wait for the `homelab-deploy` commit status before the job completes.
- Adds at most ~90s to CI runtime (time from SHA match to bot gateway healthy).

**Negative:**

- Requires `GITHUB_DEPLOY_STATUS_TOKEN` to be configured on homelab. If absent, step warns
  and proceeds — the race condition remains in degraded mode.
- If `deploy.sh` exit trap fails to call `post_deploy_status`, the step times out (warn).

**Neutral:**

- The bot health gate's warn-on-timeout design is preserved end-to-end: a Discord outage
  causes `deploy.sh` to warn (not fail), so `homelab-deploy` still reaches `success`, and CI
  follows.

## Revisit when

- `GITHUB_DEPLOY_STATUS_TOKEN` stability breaks on homelab → flip to Option 4 + enhanced
  Discord alerting (post bot health outcome to channel explicitly).
- Bot health gate is changed from warn-on-timeout to fail-on-timeout → reassess whether
  CI timeout warning is still appropriate.
