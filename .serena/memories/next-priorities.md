# Next Priorities (2026-03-18)

## P1 — Metadata and docs integrity (small PRs)
1. Sync stale release references across docs and README to v2.6.37.
2. Repair `CHANGELOG.md` structure drift (duplicate release blocks, duplicate `Unreleased` section).
3. Align package metadata (`package-lock.json` top-level version) with `package.json`.

## P2 — CI and local hygiene
1. Resolve or archive local `.worktrees/fix-319` uncommitted frontend tests.
2. Keep branch/worktree cleanup strict after each release PR.
3. Preserve required-check reliability posture (avoid weakening release-branch CI requirements).

## P3 — Product backlog candidates
1. Autoplay intelligence follow-ups: broader reason tags and feedback diversity constraints.
2. Guild automation RBAC drift follow-up after recent command and route changes.
3. Presence/activity customization pass (low risk quality-of-life).

## Execution preference (user)
- Prioritize small commits/PRs for fastest production delivery.
- Avoid batching large cumulative changes.
