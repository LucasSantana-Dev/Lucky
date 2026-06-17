# Release cadence: automate releases with release-please, keep the deploy gate

- Status: accepted (adopt release-please; pilot via dry-run before enabling on main)
- Date: 2026-06-16

## Context

Production drifted badly stale and nobody noticed until SSH inspection during the
Loki work (2026-06-16):

- Prod ran image `ff5e0b6` (2026-06-14) — **135 commits / 8+ days behind `main`**.
- The latest GitHub Release is **v2.17.0 (2026-06-08)**; `ff5e0b6` is newer than that
  release and is **not** a release — it was a one-off manual `workflow_dispatch`.
- **Two fixes for incidents that happened that same day were merged to `main` but not
  in prod**: the bot auto-join-and-play bug (#1467/#1469) and the YouTube "no results"
  bug (#1472). Production still had both bugs after we "fixed" them.

Root cause is a process gap, not a broken pipeline:

- On 2026-06-13 (#1397 / PR #1398), production deploys were intentionally gated to the
  `release: published` event (plus manual `workflow_dispatch`), removing the previous
  deploy-on-every-main-push behavior. Good intent: controlled, tagged, baked deploys.
- But **releases are created fully manually** — hand-bump `package.json`, hand-write
  `CHANGELOG.md`, tag `vX.Y.Z`, push (→ `release.yml` creates the GitHub Release →
  `deploy.yml`). That manual step became an unstaffed bottleneck: no release was cut
  for 135 commits, so the gate had nothing to fire on and prod silently rotted.

The pipeline itself is sound and worth preserving: `docker-publish.yml` builds
`:latest` + `:<sha>` per service on every main push (path-filtered); `deploy.yml`
resolves the released SHA, waits a 30-minute `Production` environment bake, webhooks
the homelab to pull `:<sha>`, runs prisma migrations, health-checks, and auto-rolls
back to the last-good baked COMMIT_SHA. The single weak link is the **manual release
step** in front of the gate.

Enabling facts (verified):

- Conventional-commit messages are enforced by commitlint; the last 50 main commits
  are all compliant → release-please can compute versions/changelog cleanly.
- Squash-merge to main means one conventional commit per PR (the PR title) → an
  unambiguous bump per PR.
- A `CHANGELOG.md` already exists (release-please will own it).
- release-please **does not auto-merge** its release PR by default (verified) — a
  human merges it; auto-merge is an opt-in.

## Decision

Adopt **release-please** (`googleapis/release-please-action`) to automate the release
step, and **keep the `release: published` → `deploy.yml` gate unchanged**.

- On every push to `main`, release-please maintains a single **release PR** that
  accumulates conventional-commit changes and pre-computes the next semver bump +
  CHANGELOG. The PR is always open and up to date — a standing, visible "N unreleased
  changes" signal, the absence of which is exactly what let prod rot.
- **Merging the release PR** creates the tag + publishes the GitHub Release →
  `deploy.yml` fires (30-min bake, webhook, migrations, health-check, auto-rollback).
- **Do not enable auto-merge** (for now). The one-click human merge is the deliberate
  "ship to prod" checkpoint — it preserves #1397's controlled-deploy intent (review
  before a migration-bearing prod deploy on a single-operator box) while removing the
  real friction (manual version/changelog/tag effort + invisibility). Auto-merge stays
  a documented opt-in if even that click later proves too much.
- **Incident hotfixes keep the existing `workflow_dispatch` fast-path** — deploy any
  SHA immediately, independent of release cadence. Release cadence is for normal flow;
  incidents do not wait for a release PR.
- **Replace `release.yml`:** it triggers on `v*` tag push and creates a GitHub Release
  via `action-gh-release`. release-please does the same on PR merge, so leaving
  `release.yml` active would double-create / conflict. Disable or repurpose it (its
  build+test gate can move to CI if not already covered).

This honors #1397 (controlled, gated, baked deploys) while fixing its unintended side
effect (a manual bottleneck that stalled prod and stranded incident fixes).

## Pilot / adoption plan

1. **Dry-run on a feature branch first** (the critic's mandated gate). Enable the
   release-please workflow on a branch; push a conventional commit; confirm: a release
   PR is created with the right bump + changelog; on merge it tags `v*` and publishes a
   Release; that Release event triggers `deploy.yml`; the 30-min bake + homelab webhook
    - image-for-SHA resolution all still work end-to-end.
2. **Seed the version** so release-please starts from 2.17.0 (manifest/bootstrap), so
   the first managed release is 2.18.0, not a reset.
3. **Disable `release.yml`** in the same change to avoid duplicate-release conflicts.
4. **Success criteria:** (a) a release PR appears and stays current on main pushes;
   (b) merging it deploys to prod through the unchanged gate; (c) prod's deployed SHA
   tracks the latest merged release within one bake cycle; (d) the hotfix
   `workflow_dispatch` path still ships an arbitrary SHA immediately.
5. **Rollback:** if release-please misbehaves (wrong bump, duplicate/draft release,
   malformed changelog), disable its workflow and fall back to the manual
   tag/`workflow_dispatch` flow that exists today — zero data loss, reversible.

Independent immediate action (NOT part of this decision, do regardless): ship today's
incident fixes to prod now via `workflow_dispatch` (or by cutting the first release),
since prod still runs the buggy `ff5e0b6`.

## Alternatives considered

- **Status quo — keep manual releases, "just cut them more often."** Rejected: the
  bottleneck already failed (135 commits unreleased, incident fixes stranded). Relying
  on the discipline that just lapsed is not a fix.
- **Revert to deploy-on-every-main-push (pre-2026-06-13).** Rejected: fights the recent
  #1397 decision, reintroduces per-merge deploy churn, and deploys unversioned /
  unreleased SHAs with no changelog or human ship-checkpoint.
- **whats-up-docker auto-pull of `:latest` on the box** (already running there).
  Rejected: bypasses prisma-migration ordering, health-checks, SHA-pinning, and
  auto-rollback that `deploy.yml` performs — and the gate entirely. Unsafe for a
  migration-bearing app.
- **Nightly scheduled deploy of latest `main`.** Rejected: a weaker automation that
  still ships unversioned SHAs, adds a second deploy path, and bakes in up-to-24h lag.
- **release-please WITH auto-merge.** Not rejected — deferred. Viable later if the
  one-click checkpoint proves to be friction; kept off now to retain a human "ship"
  gate consistent with #1397.
- **semantic-release / changesets.** Reasonable peers; release-please chosen for the
  release-PR model (visible, reviewable, no npm-publish coupling) and first-class
  GitHub-Release output that the existing `release: published` gate already consumes.

## Consequences

- **Positive:** prod stops silently rotting — the open release PR makes "unreleased
  changes" impossible to forget; releases become one-click with auto changelog +
  semver; the deliberate gate, bake timer, migrations, and auto-rollback are all
  preserved; the change is reversible (disable one workflow → back to manual).
- **Negative:** one more GitHub Action dependency (Google-maintained; major-version
  breaks possible); a human still must click "merge" to ship (intentional, but it is
  not zero-touch); `release.yml` must be retired to avoid duplicate releases; semver
  correctness now depends on PR-title/commit discipline (already enforced, but a
  mislabeled squash title could mis-bump — caught by reviewing the release PR).
- **Neutral:** versioning moves from hand-edited `package.json` to release-please's
  managed bump; CHANGELOG ownership moves to the tool.

## Revisit when

- The one-click release-PR merge itself becomes the new thing that doesn't happen →
  enable auto-merge (the deferred alternative) so prod tracks main fully automatically.
- release-please proves flaky in this repo (wrong bumps, event-ordering misses,
  changelog conflicts) over the first ~3 releases → fall back to manual + reassess
  (semantic-release / changesets).
- Deploy risk profile changes (e.g., migrations become routinely backward-incompatible)
  → reconsider whether the human ship-checkpoint should become stricter, not looser.
- The project gains a second maintainer / moves off the single-operator homelab →
  re-evaluate cadence and whether continuous deployment is now appropriate.
