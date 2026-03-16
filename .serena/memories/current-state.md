# Lucky — Current State

**Updated**: 2026-03-16
**Latest release**: v2.6.24
**Main branch**: at `e69c048` (origin/main); local root checkout still at `393b857` (needs pull)

## What's in v2.6.24
- feat: /queue smartshuffle — energy-aware ordering with streak limit (#298)
- feat: /mod digest command for moderation summary (#299)

## What's on main post-v2.6.24 (unreleased — will be v2.6.25)
- fix(lint): remove unused params in lucky-policy-lib.mjs (#302)
- chore(deps): patch/minor dep updates Mar 2026 (#303)
- test(frontend): enable skipped Moderation filter tests (#304)
- fix(bot): standardize command responses to embeds and English (#305)

## CI / Quality
- npm audit: 0 vulnerabilities
- All tests: 429/429 bot passing, 18/18 Moderation frontend passing
- SonarCloud: passing on main

## Active Worktrees
- `.worktrees/fix-command-polish` — stale (PR #305 merged)
- `.worktrees/fix-moderation-tests` — stale (PR #304 merged)

## Open Issues
- None

## Open PRs
- None

## Known Issues / Pending Work
- lucky-policy-lib.mjs has a bug: `isPrimaryCheckout(repoRoot)` should be `isPrimaryCheckout(cwd)` — fix has been applied locally, needs to be committed via PR
- Stale worktrees need cleanup
- v2.6.25 release not yet cut
