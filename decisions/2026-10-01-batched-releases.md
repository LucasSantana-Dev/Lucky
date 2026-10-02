# Batch merged work into fewer releases; the frontend ships with the release

- **Date:** 2026-10-01
- **Status:** Accepted
- **Deciders:** Lucas Santana
- **Scope:** `.github/workflows/deploy-frontend-cf.yml`, `.github/dependabot.yml`,
  release-please PR merge cadence
- **Supersedes:** the "one-click human merge is the ship-to-prod checkpoint" rule of
  `decisions/2026-06-16-release-cadence-automate-releases.md`. The owner granted the batch
  loop authority to merge the release PR under the gate below (2026-10-01).

## Context

On 2026-10-01 production took 5 releases (v2.47.4 to v2.47.8) and 22 frontend deploys.
Two triggers drove that:

- The homelab deploy (`deploy.yml`) runs on `release: published`, so every merge of the
  release-please PR is a backend + bot rollout. That PR was merged right after each fix.
- The Cloudflare Pages deploy (`deploy-frontend-cf.yml`) ran on every push to `main` that
  touched `packages/frontend`, `packages/shared`, `prisma` or `CHANGELOG.md`. Every merged
  PR was its own production deploy, plus one more when the release PR changed the changelog.

Most of those deploys carried one small UI fix each.

## Decision

1. The Cloudflare Pages deploy runs after a **successful, release-triggered** homelab deploy
   (`workflow_run` on "Deploy to Homelab", filtered to `event == release`), and builds the
   release commit (`workflow_run.head_sha`). It no longer runs on push. The homelab deploy
   waits up to 30 min for images, so this ordering keeps the UI from going live before the
   API it calls. A rollback dispatch of `deploy.yml` does not redeploy the frontend.
2. Merging to `main` is not a deploy. The release-please PR is the only deploy switch:
    - **Right away:** a merged security fix, a production bug labeled `P0` or `P1`, or an
      open incident.
    - **Otherwise once per loop run**, at its end, when at least one releasable commit is
      pending and the release PR's CI is green. A loop run is capped (4 merged batches or
      about 3 h), so each release carries a batch, never a single fix.
    - Work merged outside a loop run waits for the next run, or the owner merges the release
      PR by hand.
3. Related issues are batched into one PR (same package and area, at most 4 issues or
   about 400 changed lines) so `main` also takes fewer pushes.
4. A change users can see is committed as `fix` or `feat`, never `chore`, because
   release-please only cuts a release for `feat`, `fix` and `perf`. Dependabot runtime bumps
   use the `fix(deps)` prefix for the same reason; dev bumps stay `chore(deps-dev)`.

## Consequences

- A merged UI fix is not live until the next release. Visual checks before release use the
  staging deploy (`staging` label on the PR, `deploy-staging.yml`) or a local build.
- `chore`, `docs`, `test`, `ci` and `refactor` commits never cut a release on their own. They
  ship with the next `fix`/`feat` release; they are not user-visible.
- An urgent frontend-only fix can ship through `workflow_dispatch` on `deploy-frontend-cf.yml`,
  run from the hotfix tag or commit. Run from `main`, it ships every unreleased UI change.
- If the homelab deploy fails, the frontend does not ship either. That is intended: the
  release is all or nothing.
- Docker images are still built on push (`docker-publish.yml`); that is CI, not a deploy.

## Revisit when

A releasable commit sits on `main` unreleased for more than 48 h, or a user-facing
regression waits for a loop run that never comes. Then add a scheduled gate.
