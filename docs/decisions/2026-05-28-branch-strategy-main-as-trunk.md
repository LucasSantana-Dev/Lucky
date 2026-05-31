# Branch strategy: main-as-trunk (retire versioned release branches)

- **Date:** 2026-05-28
- **Status:** Accepted
- **Supersedes:** the versioned-release-branch model documented in
  `docs/RELEASE_CADENCE.md` and memory `feedback_tbd_release_branches`

## Context

Lucky had drifted between two branching models. Documentation + an older memory
prescribed **versioned release branches** (`release/vX.Y.Z` cut from `main`, PRs
target the release branch, `/release-cut` promotes to `main`). Recent practice had
drifted to **main-as-trunk** (the last several v2.15.x releases were tagged
directly on `main`; PRs targeted `main`).

While cutting v2.16.0 via the release-branch path, `/research-and-decide` +
`critic` review surfaced that the release-branch model is **over-engineered for a
single operator** and that one of its load-bearing rationales was **false**:

- The repo is **squash-only** (`allow_merge_commit: false`,
  `allow_rebase_merge: false`). The documented "merge commit preserves individual
  PR SHAs" benefit was never achievable — every release merge squashes.
- PR-retargeting friction (PRs default to `main`, then need retargeting to the
  release branch) recurred this very session.
- Release branches can enter limbo / drift states; the `release-branch-autosync`
  workflow only fast-forwards one direction and can't recover from divergence.
- A single operator has no concurrent release trains to isolate — the model
  solves a coordination problem that does not exist here.

## Decision

Adopt **trunk-based development on `main`**:

- `main` is the single integration branch, always releasable.
- Short-lived `feature/<slug>` / `fix/<slug>` branches → PR → `main` (squash).
- **No long-lived or versioned release branches.**
- Versions are batched via the `[Unreleased]` CHANGELOG section and cut by a
  bump+changelog PR + a tag on `main` (push to `main` auto-deploys to homelab,
  gated by the Production 30-min `wait_timer`).

## Alternatives considered

- **Versioned release branches (`release/vX.Y.Z`)** — rejected: solo-operator
  overhead, retargeting friction, drift/limbo failure modes, and the false
  SHA-preservation rationale under squash-only merges.
- **Long-lived single `release` branch (Gitflow-lite)** — rejected: persistent
  divergence + heavier process, same coordination-problem-that-doesn't-exist.
- **Full Gitflow (develop + release + main)** — rejected outright: far too heavy
  for a solo-operated repo.

## Consequences

**Positive:** no retargeting friction; no sync invariant / autosync workflow to
maintain; fewer failure modes; simpler mental model; honest docs (squash reality).

**Negative / neutral:** loses the (theoretical) pre-`main` staging buffer a release
branch provided; version batching now relies on CHANGELOG `[Unreleased]` discipline
(already enforced by `dangerfile.ts`); `/release-cut`'s release-branch promotion is
retired in favor of a bump+changelog+tag PR on `main`.

**Migration actions (this change):** delete `release-branch-autosync.yml`,
`release-train-changelog-check.yml`, and `scripts/check-release-sync.sh`; rewrite
`docs/RELEASE_CADENCE.md`; adjust the `trunk-based-dev` skill toward main-targeting;
supersede the `feedback_tbd_release_branches` memory.

## Revisit when

- The project gains **2+ concurrent maintainers** working on parallel release
  trains (e.g. patching v2.16 while developing v2.17 features) → reconsider release
  branches for isolation.
- Release cadence becomes **sub-daily** such that per-version branch isolation pays
  for itself.
- CHANGELOG `[Unreleased]` discipline breaks down repeatedly despite the danger
  rule → reconsider a branch-based batching fallback.
