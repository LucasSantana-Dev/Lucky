# Hotfix to prod: a committed runbook over the workflow_dispatch fast-path

- Status: accepted
- Date: 2026-06-17

## Context

On 2026-06-16/17 the operator manually shipped two incident fixes to the
production homelab. The deploy machinery worked well, but the _judgment_ around it
was non-obvious and nearly went wrong:

- Deploying `main` HEAD would have **failed** — HEAD was a compose-only commit
  (`#1476`), and `docker-publish.yml` is path-filtered, so no `:<sha>` images
  existed for it; the box's pinned-pull guard would have aborted. The correct
  target was the newest commit whose `docker-publish` run succeeded (all four
  images built) that still contained the fix (`2e7f1bbe`).
- `rollback_sha` is the only `workflow_dispatch` input that pins an exact
  already-built SHA, so it doubles as the "forward-deploy this exact SHA" lever.
- The deploy needed pre-flight judgment: no un-applied prisma migrations in
  range, all four images present, box reachable, and a sane `.deploy-last-good-sha`
  rollback baseline.

This is repeated operational friction with a real near-miss. It deserves captured,
durable procedure rather than re-derivation each incident.

A **generic global `/hotfix` agent skill already exists**, but it is built on a
`release`-branch cadence (branch-from-main-not-release, manual `version-bump` +
patch tag, `/ship-it`, cherry-pick back to `release`). Lucky is **main-as-trunk**
(no live `release` branch), is adopting **release-please** to own
versioning/tags/changelog (ADR 2026-06-16, accepted), and deploys via
**`workflow_dispatch` of a SHA** to a homelab box — not a tag-and-ship. The global
skill's phases would fail or conflict here.

Enabling facts (verified in-repo, 2026-06-17):

- `docker-publish.yml` matrix builds all four services per run; `conclusion=success`
  ⟹ all four `:<short-sha>` images were pushed.
- `deploy.yml` resets the box tree to `origin/main` but deploys the **pinned**
  `IMAGE_TAG=<short-sha>` images; runs migrations; health-gates; auto-rolls-back
  to `.deploy-last-good-sha`; aborts if the pinned image can't be pulled.
- `.deploy-last-good-sha` is an on-disk file on the box, written by `deploy.sh`
  after a healthy deploy from the running image's baked `COMMIT_SHA` (advanced
  `ff5e0b68 → 2e7f1bbe` this session); persists across reboot; rollback is skipped
  if it's empty or equals the deploying SHA.
- The `Production` environment has no protection rules / no bake timer; a dispatch
  deploy completes in ~1.5 min (GH) + ~2 min (box).
- `deploy.yml` has `concurrency: deployment-production` (no cancel) and `deploy.sh`
  holds a lockfile — concurrent hotfixes queue, they do not race.
- `.claude/` in Lucky is local-only/untracked; agent-actionable context must be
  committed to be the source of truth.

## Decision

Add a **committed `docs/runbooks/hotfix.md`** that codifies Lucky's verified
emergency-deploy fast-path, and treat it as the authority over the generic global
`/hotfix` skill when operating in this repo.

The runbook: severity gate → land fix on `main` (prefer revert) → **resolve the
target SHA** (newest commit with a successful `docker-publish` run that contains
the fix, via a named `gh run list` query — NOT necessarily `main` HEAD) →
pre-flight (migrations in range, images exist via the run conclusion, box health,
sane rollback baseline) → deploy with `gh workflow run deploy.yml -f
rollback_sha=<sha>` → monitor GH + box log to terminal → verify live + Sentry →
**no manual version tag** (a hotfix deploys a SHA; the next normal release includes
the already-merged fix).

Every mechanical step names the **exact command** so an agent (or human) executes
it deterministically rather than guessing — this folds the determinism of a script
into the runbook without a second artifact that drifts from `deploy.yml`.

## Alternatives considered

- **Lucky-local agent skill (`.claude/skills/`).** Rejected: `.claude/` is
  untracked → not SoT, lost on a clean clone, violates the commit-context rule.
- **Fork/edit the global `/hotfix` skill to be Lucky-aware.** Rejected: pollutes a
  generic cross-repo skill with Lucky homelab/`deploy.yml` specifics.
- **`scripts/hotfix.sh` automating the gh + box calls.** Deferred, not chosen now:
  it adds a second thing that drifts from `deploy.yml`, and shell is brittle for
  the SHA-resolution judgment; an agent running the runbook's exact `--json`
  commands already gets determinism. Promote to a script (with `--dry-run`) only if
  hotfix frequency makes hand-running too slow (revisit trigger).
- **Status quo / ad-hoc.** Rejected: the near-miss (almost deployed an imageless
  commit) and the likelihood of recurrence show captured procedure has clear value.

## Consequences

- **Positive:** durable, committed, agent- and human-readable; encodes the
  non-obvious SHA-resolution trap and the `rollback_sha`-as-forward-deploy lever;
  reuses the existing robust `deploy.yml` (no new infrastructure); reversible
  (delete a doc).
- **Negative:** a runbook is not executable — it relies on being followed, and can
  drift from `deploy.yml` if that workflow changes (mitigated by the revisit
  trigger + the runbook citing the specific workflow behaviors it depends on); the
  global `/hotfix` skill stays mismatched outside Lucky (only overridden here).
- **Neutral:** when release-please lands, the "no manual tag" step is unchanged and
  even clearer.

## Decision-critic reconciliation

`decision-critic` returned **ACCEPT-WITH-REVISIONS**. Reconciliation after
verifying its Claims-To-Verify with tools it lacked:

- **"CRITICAL: release-please can tag an older commit and clobber the hotfix" —
  refuted.** release-please tags the release commit at `main` HEAD on PR merge, so
  the tag is always at-or-ahead of the hotfix commit (which is on `main`); it never
  tags backward. The box auto-rollback targets `.deploy-last-good-sha` (the
  hotfix), not the latest release tag. So neither a normal release nor a rollback
  can strand the hotfix. Added a one-line note that prod is briefly ahead of the
  latest tag until the next release (benign).
- **Release-please-independence claim — verified** against the 2026-06-16
  release-cadence ADR ("incident hotfixes keep the workflow_dispatch fast-path …
  independent of release cadence").
- **`.deploy-last-good-sha` opacity — resolved** from `deploy.sh` (on-disk,
  workflow-maintained, persistent); documented in the runbook.
- **Concurrency — already mitigated** by `deploy.yml` concurrency group + box
  lockfile; noted in the runbook.
- **Accepted revisions:** named the exact SHA-resolution + image-existence commands
  in the runbook. **Declined revision:** a separate `scripts/hotfix.sh` (drift +
  maintenance the critic itself flagged), kept as a revisit trigger.

## Revisit when

- release-please is implemented → re-confirm the hotfix path bypasses the release
  PR cleanly and the "no manual tag" step still holds.
- `deploy.yml`'s SHA-resolution, image-tagging, or rollback mechanics change →
  update the runbook in lockstep.
- Hotfix frequency rises enough that hand-running the steps is too slow → promote
  steps 2–3 to a committed `scripts/hotfix.sh` with a `--dry-run`.
