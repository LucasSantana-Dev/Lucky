# Release Cadence — Lucky

How this repo ships.

## Model — trunk-based development on `main`

Lucky uses **trunk-based development**: `main` is the single integration branch
and is always releasable. Short-lived `feature/<slug>` and `fix/<slug>` branches
are cut from `main`, reviewed via PR, and merged back to `main`. There are **no
long-lived or versioned release branches** — versions are cut directly from
`main` by tagging.

> **Squash-only.** This repo is configured for squash-merge
> (`allow_merge_commit: false`, `allow_rebase_merge: false`). Every PR collapses
> to one commit on `main`; individual pre-squash SHAs are **not** preserved. This
> supersedes the earlier versioned-release-branch model and its inaccurate "merge
> commit preserves individual PR SHAs" claim — see ADR
> `decisions/2026-05-28-branch-strategy-main-as-trunk.md`.

```
main ──●──●──●──●──●──●──── (tag v2.16.0) ──●──●──●──── (tag v2.17.0)
       feature/ + fix/ PRs squash-merge to main; versions are tags on main
```

## Versioning — batch via CHANGELOG, cut by tagging `main`

Work accumulates under `## [Unreleased]` in `CHANGELOG.md`. To ship a version:

1. `version-bump` proposes patch / minor / major from conventional commits.
2. In one PR: bump the 5 `package.json` versions and promote `[Unreleased]` →
   `[X.Y.Z] - YYYY-MM-DD`.
3. Merge to `main`, create annotated tag `vX.Y.Z`, publish the GitHub release.
4. Push to `main` auto-deploys to homelab (gated by the Production 30-minute
   `wait_timer` environment rule).

## Bump strategy (proposed by `version-bump` from conventional commits)

| Prefix mix since last tag             | Bump  |
| ------------------------------------- | ----- |
| any `BREAKING CHANGE` or `feat!:`     | major |
| at least one `feat:` (no breaking)    | minor |
| only `fix:`, `chore:`, `ci:`, `docs:` | patch |

## CHANGELOG hygiene

- Every PR touching `packages/{bot,backend,frontend}/src/` adds a line under
  `## [Unreleased]` (see `dangerfile.ts` rule).
- `chore(deps)`, `chore(deps-dev)`, `ci:`, `build:`, `style:`, `docs:` are exempt.
- The version-cut PR promotes `[Unreleased]` → `[X.Y.Z] - YYYY-MM-DD` and re-adds
  an empty `[Unreleased]` skeleton.

## Bot PRs (Dependabot)

Handled by `/dep-sweep`. See `.claude/dep-sweep-config.json`:

- Dev-deps: auto-merge minor + patch
- Production deps: manual review (see `sensitive` list)
- Framework deps (react, vite, next): always hold (see `always_hold`)
- `discord.js`, `discord-player`, `@prisma/client`: sensitive, manual review even
  on patches — runtime-critical for the bot's voice / DB layer

## Hotfix

A production-impacting fix is just a `fix/<slug>` branch → PR → `main` → tag
`vX.Y.Z+1`. No release-branch cherry-pick or sync is needed (there is no release
branch). Criteria for fast-tracking:

1. Production-impacting bug, not new functionality
2. ≤ 100 LOC across ≤ 3 files
3. Required checks green (main is protected: 5 required checks, `enforce_admins`)

## References

- ADR: `decisions/2026-05-28-branch-strategy-main-as-trunk.md` (this model)
- ADR: `decisions/2026-05-09-branch-strategy-no-stacking.md`
