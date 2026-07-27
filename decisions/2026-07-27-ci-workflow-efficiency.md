# CI workflow efficiency refactor: fold micro-workflows, delete dead weight, extract deploy scripts

- **Status:** Accepted
- **Date:** 2026-07-27
- **Tags:** ci, github-actions, efficiency, refactor

## Context

An audit of `.github/workflows` (24 files, 2925 lines) found the suite had grown by accretion:

- **Dead weight:** `vercel-deploy-watch.yml` polled three Vercel projects that are not this repo (the Lucky projects were removed from it after the CF Pages migration, per its own comment) on a 15-minute cron. `ci.yml`'s security job had a literal no-op Socket.dev echo step and an advisory TruffleHog step duplicating blocking coverage (secretlint + GitGuardian app). `renovate-health.yml` exited 1 every week while its tracking issue (#1835) was already open, producing permanent red noise.
- **Micro-workflows paying full setup for seconds of work:** `path-portability.yml`, `madge.yml`, and `queueresolver-canary.yml` each paid checkout + setup (one a full `npm ci`) to run checks that take seconds, and the canary re-ran specs that `ci.yml`'s `test-bot` already runs.
- **Duplication:** `ci.yml`'s docker-build job held byte-identical retry blocks; `labeler.yml` + `pr-size.yml` were two workflows for one concern; `mutation.yml` had three copy-paste jobs; `deploy.yml` (763 lines) inlined webhook triggering, origin derivation, status polling, and OAuth smokes, several blocks duplicated verbatim within the same file.
- **Double lint:** the org reusable `quality.yml` re-ran lint that `ci.yml`'s checks job already runs.

The trigger for the audit was external-contributor PRs exposing how much of the suite runs without providing gate signal.

## Decision

- **Deleted:** `vercel-deploy-watch.yml`; the Socket.dev echo and TruffleHog steps in `ci.yml` (secretlint + GitGuardian remain the blocking secret-scan layer).
- **Folded into `ci.yml`:** path-portability as a step in `checks`; the discord-player major-pin guard as steps in `test-bot`; madge as a new job named exactly `madge / packages/bot` (the branch ruleset requires that check context; preserving the name avoids a ruleset change). Deleted the three source workflows.
- **Consolidated:** `labeler.yml` + `pr-size.yml` into `pr-labels.yml` on `pull_request_target` (no checkout, fork-safe); `mutation.yml`'s three jobs into one matrix job; `bundle-size.yml` lost the informational `compressed-size` job (kept the `size-limit` hard gate), removing a second frontend build and the pnpm workaround; `ci.yml`'s docker build/buildx retry duplication into the composite action `.github/actions/docker-build-service`.
- **Extracted from `deploy.yml`** (763 to 360 lines) into `scripts/deploy/`: `derive-webhook-origin.sh`, `trigger-deploy-webhook.sh`, `wait-homelab-status.sh`, `oauth-smoke.sh`. Both `deploy.yml` and `deploy-staging.yml` gained a checkout step (previously absent, required for the scripts). Behavior preserved per block, verified with shellcheck + actionlint + mock-server functional tests.
- **Noise reduction:** `renovate-health.yml` exits 0 when the tracking issue already exists (fails only on new detection); `auto-update-pr-branches.yml` cron reduced from every 15 minutes to hourly.
- **quality.yml caller** passes `lint-script: ''` to stop the double lint; semgrep/CodeQL/trivy/osv/actionlint/hadolint/knip coverage is unchanged.

## Alternatives considered

- **Keep `compressed-size` PR commentary** — rejected: informational-only, and it built the frontend a second time per PR. The `size-limit` hard gate carries the actual protection.
- **Cross-workflow artifact reuse for mutation.yml** (download ci.yml's `shared-build` instead of rebuilding) — rejected for now: cross-run artifact download needs run-id plumbing; matrix conversion already removed the YAML triplication at zero risk.
- **Unify `ci.yml` + `docker-publish.yml` docker matrices into a reusable workflow** — deferred: the gha cache is shared so runtime cost is low, and the churn risk on the publish path is not justified today.
- **Rewrite deploy.yml's "Wait for Docker images" poll as a `workflow_run` chain** — deferred: works today, risky to rewrite blind; noted as follow-up.
- **AI-reviewer consolidation (PR-Agent vs cubic vs CodeRabbit)** — explicitly out of scope: three AI reviewers per PR is real redundancy (comment noise + Anthropic API cost), but pr-agent.yml was repaired for fork PRs the same day and picking the survivor is a product decision, not a CI hygiene one.

## Consequences

- **Positive:** fewer runner-minutes per PR (three folded workflows' setup overhead gone, one frontend build gone, double lint gone); no weekly red noise from renovate-health; deploy logic testable locally (`scripts/deploy/*.sh` run under bash/shellcheck/mock servers); single source for the docker build invocation.
- **Negative:** more indirection in `deploy.yml` (logic lives in scripts; reviewers must read two places); the composite action's `hashFiles('package-lock.json')` evaluation inside a composite `with:` block is a watch item (if `NPM_CACHE_KEY` arrives empty, hoist it to job env).
- **Gate safety:** all required check contexts (Quality Gates, Security, SonarCloud Scan, `madge / packages/bot`, Build — Docker images, Migrations apply on Postgres 18) are preserved by construction; no ruleset change was needed.

## Revisit when

- The vercel-deploy-watch deletion matters to someone: the three watched project IDs belonged to other projects; if that monitoring is still wanted, it belongs in a different repo or a standalone monitor, not here.
- `compressed-size` commentary is missed: re-add as a job that consumes the `size-limit` build output instead of rebuilding.
- Deploy script extraction proves sound in production for a few releases: apply the same treatment to the "Wait for Docker images" block.
- AI review noise or Anthropic cost becomes a problem: consolidate to a single AI reviewer (ADR that choice separately).
