# Release Cadence — Lucky

How this repo ships.

## Model — versioned release branches

Lucky uses **trunk-based development with versioned release branches**, NOT a
single long-lived `release` branch. For each upcoming version a dedicated
`release/vX.Y.Z` branch is created off `main`; PRs targeting the next release
land there via `/pr-to-release`. When the batch is ready, `/release-cut`
promotes `release/vX.Y.Z` → `main` with a merge commit (preserves individual
PR SHAs), tags `vX.Y.Z`, and publishes the GitHub release.

This memory entry is canonical (see `feedback_tbd_release_branches.md` in
project memory).

```
main ─────●──────────────────●─────────●──────────────────●─────────
           \                 ↑          \                 ↑
            release/v2.9.0 ──┘           release/v2.10.0 ──┘  (next: release/v2.11.0)
            (15 PRs squashed)            (15 PRs squashed)
```

## Active release branch

The currently active release-staging branch is recorded in
`.claude/dep-sweep-config.json#base_branch`. As of 2026-05-13: **v2.10.0
shipped**; next active branch is `release/v2.11.0` (to be created by the
first PR that needs to ship in v2.11.0).

`/pr-to-release` falls back to the latest `release/vX.Y.Z` if no version is
specified.

## Cadence triggers

- **Manual:** user invokes `/release-cut release/vX.Y.Z`
- **Nudge:** `git rev-list --count main..release/vX.Y.Z` ≥ 5 commits → surface
  in `/next-priority` and `/session-bootstrap` output
- **Hotfix exception:** `/hotfix` bypasses the release branch, patches `main`
  directly, tags `vX.Y.Z+1`, then cherry-picks the fix back to the active
  release branch

## Bump strategy (proposed by `version-bump` from conventional commits)

| Prefix mix in the batch               | Bump  |
| ------------------------------------- | ----- |
| any `BREAKING CHANGE` or `feat!:`     | major |
| at least one `feat:` (no breaking)    | minor |
| only `fix:`, `chore:`, `ci:`, `docs:` | patch |

## CHANGELOG hygiene

- Every PR that touches `packages/{bot,backend,frontend}/src/` adds a line
  under `## [Unreleased]` (see `dangerfile.ts` rule)
- `chore(deps)`, `chore(deps-dev)`, `ci:`, `build:`, `style:`, `docs:` are
  exempt — they're internal-only
- `/release-cut` Phase 3 promotes `[Unreleased]` → `[X.Y.Z] - YYYY-MM-DD`
- **Hard stop:** `/release-cut` refuses to proceed if `[Unreleased]` is empty
  but the branch has > 0 commits ahead of main — caller must populate first

See follow-up issue Lucky #840 for tightening this rule (currently too
permissive on `fix:` and `refactor:` prefixes).

## Bot PRs (Dependabot)

Handled by `/dep-sweep`. See `.claude/dep-sweep-config.json` for the rules:

- Dev-deps: auto-merge minor + patch
- Production deps: manual review (see `sensitive` list)
- Framework deps (react, vite, next): always hold (see `always_hold`)
- `discord.js`, `discord-player`, `@prisma/client`: sensitive, manual review
  even on patches — runtime-critical for the bot's voice / DB layer

## Hotfix policy

`/hotfix` is the **only** acceptable bypass of the release branch.
Criteria:

1. The fix is for a production-impacting bug, not new functionality
2. It can be expressed in ≤ 100 LOC across ≤ 3 files
3. The fix is reviewed by at least one human before merge
4. After merge to `main` + tag, the commit is cherry-picked back to the
   active `release/vX.Y.Z` so the next planned cut includes it

Routine "small fix" work goes through `/pr-to-release`, not `/hotfix`.

## Sync invariant

`release/vX.Y.Z` must always be at-or-ahead-of `main`, never behind. After
any direct-to-main merge (hotfix, dependabot to main, etc.), fast-forward
the active release branch.

### Automated enforcement

The workflow `.github/workflows/release-branch-autosync.yml` runs after every
push to `main` and automatically fast-forwards the active release branch
(highest semver `release/vX.Y.Z`) to match `main`. The workflow:

- Detects the active release branch by finding the highest semver tag
- Fast-forwards to `main` using `git push origin main:<active> --force-with-lease`
- Fails loudly if the release branch has commits NOT in `main` (true divergence),
  surfacing a warning and requiring manual sync

For local verification, use the script `scripts/check-release-sync.sh` to
validate the invariant before pushing to main.

## References

- ADR: `docs/decisions/2026-05-09-branch-strategy-no-stacking.md`
- ADR: `docs/decisions/2026-05-09-bot-test-suite-cleanup-strategy.md`
- Memory: `feedback_tbd_release_branches.md`
- Follow-ups: Lucky #840 (changelog hygiene), Lucky #841 (release sync invariant)
