# Spec: Backlog Map — 2026-04-25

> Draft promotion of the Top-10 items from `.claude/plans/backlog-2026-04-25.md`.
> Re-evaluate every two weeks; supersedes `docs/specs/2026-04-22-backlog-map/`.

## Anchor

- Source backlog: `.claude/plans/backlog-2026-04-25.md`.
- Prior tracked snapshot: `docs/specs/2026-04-22-backlog-map/{spec.md,tasks.md}` — to be marked superseded.
- Spec template parity: matches the `2026-04-22-backlog-map` shape.

## Top-10 (impact ÷ effort, descending)

| # | Item | Bucket | Score `[I/E/R/C]` | Evidence |
|---|------|--------|-------------------|----------|
| 1 | `@hono/node-server` `serveStatic` mitigation (verify v1.18.x patch or add path-normalization handler) | A.4 | `[high/S/low/high]` | Dependabot alert GHSA-92pp-h63x-v22m, manifest `pnpm-lock.yaml`, severity medium |
| 2 | Sweep dependabot PRs #783–#786 with `update-branch` + thread-resolution recipe | A.1 | `[med/S/low/high]` | `gh pr list --state open` returns all 4 with `BEHIND`/BLOCKED |
| 3 | Cut release tag `v2.6.148` (89 commits / 16 patches behind `v2.6.132`) | A.2 | `[med/S/med/high]` | `git rev-list --count v2.6.132..main` = 89; `package.json:version` = `2.6.148` |
| 4 | Dismiss `uuid` GHSA-w5hq-g745-h8pq alert as not-exploitable | A.5 | `[low/S/low/high]` | `grep -rE "uuid\.(v3\|v5\|v6)" packages/` returns 0 hits; only `v4` used |
| 5 | Worktree sprawl prune (44 → ~5 active) | A.3 | `[med/S/low/high]` | `git worktree list` = 44 entries |
| 6 | `BRANDING_GUIDE.md` dual-accent update (carry-over from 2026-04-22 B.1) | B.7 | `[med/S/low/high]` | ADR `docs/decisions/2026-04-21-redesign-port-target.md` (accepted) |
| 7 | Centralize `-Infinity` cross-locale guard in `upsertScoredCandidate` | E.1 | `[med/S/low/high]` | `grep -nE 'rec.score === -Infinity' packages/bot/src/utils/music/` = 3 hits |
| 8 | Split `packages/bot/src/utils/music/queueManipulation.ts` (953 LOC → ≤4 modules) | B.1 | `[high/L/med/high]` | LOC inventory; high recent churn |
| 9 | Start autoplay diversity (promote `docs/specs/2026-04-15-autoplay-diversity/` to in-progress) | B.6 | `[high/L/med/med]` | Spec exists 10 days, no implementation branch |
| 10 | Split `packages/bot/src/functions/music/commands/autoplay.ts` (1,074 LOC) | B.4 | `[med/M/low/high]` | LOC inventory; not in prior backlogs |

## Unblocks

```
A.1 ─▶ A.4 (hono family bumps include node-server in #785/#786)
A.2 ─▶ I.3 (release notes + top.gg credibility)
E.1 ─▶ B.1 (centralized veto removes one concern from the split review)
B.1 ─▶ B.4 (clear API for autoplay command surface to flatten against)
```

## Out-of-spec

- `H.` major migrations — `pnpm outdated` not pulled; major-stuck inventory is stale.
- `F.1`/`F.2`/`F.3` — measurement work; instrument before optimizing.

## Re-evaluation trigger

- Next regular cadence: **2026-05-09** (≈ 2 weeks).
- Out-of-band trigger: a new dependabot HIGH-severity alert, a release-blocker, or release tag drift > 100 commits.

See `.claude/plans/backlog-2026-04-25.md` for the full per-bucket evidence and the longer tail (B.2/B.3/B.5, D.*, F.*, I.*, J.*).
