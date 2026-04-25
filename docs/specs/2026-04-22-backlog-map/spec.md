# Spec — Backlog Map 2026-04-22

_Promoted from `.claude/plans/backlog-2026-04-22.md`. Top-10 only; full analysis in the source file._

## Scope

Single-repo backlog refresh for Lucky at 2026-04-22, anchored against the 2026-04-21 map and `docs/specs/2026-04-20-lucky-next-phases/` + `docs/specs/2026-04-15-autoplay-diversity/`.

## Context snapshot

- 3 open PRs (`#775` active, `#762` + `#761` stale drafts).
- 0 open issues, 0 CI failures last 14 days.
- **Release drift:** `v2.6.132` latest tag vs `2.6.148` in `package.json` — 81 commits unreleased.
- **Dependabot:** 4 open alerts (all medium, all upstream unfixed).
- **npm audit:** 2 moderate with **fixes available** (`follow-redirects`, `hono`) — actionable.
- **Skipped tests:** 2 in `packages/backend/tests/integration/routes/management.test.ts:249,:444` (validateBody gap).
- **Missing governance docs:** `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`.
- Branch protection enforces `SonarCloud Code Analysis` + `Quality Gates` + `Security`; no required reviews.

## Goals (measurable)

- Ship #775 → 0 non-draft open PRs.
- Close 2 actionable Dependabot alerts via lockfile bump.
- Unskip both remaining `validateBody` integration tests.
- Restore a consistent, auditable release/tag state.

## Non-goals

- Forcing #762 / #761 drafts to completion (user WIP).
- Refactoring `queueManipulation.ts` without a churn trigger — wait for a change that demands it.
- Major-version upgrades beyond `@secretlint-rule-preset-recommend` 11 → 12.

## Top 10 (impact / effort ratio)

| # | Item | Score | Evidence |
|---|---|---|---|
| 1 | **Ship #775** — dismiss stale CodeRabbit `CHANGES_REQUESTED` review after fix push `09aebe18` | `[high / S / low]` | `gh pr view 775` |
| 2 | **Patch `follow-redirects` ≥1.15.12 + `hono` ≥4.12.14 overrides** | `[high / S / low]` | `npm audit --json` moderate, `fixAvailable: true` |
| 3 | **Unskip 2 `validateBody` tests** at `management.test.ts:249,:444` | `[med / S / low]` | file grep |
| 4 | **Diagnose frontend Playwright `.last-run.json` = failed / failedTests: []** | `[med / S / low]` | artifact file |
| 5 | **Update `BRANDING_GUIDE.md` to ADR-accepted dual accent + Sora/Manrope** | `[med / S / low]` | `docs/decisions/2026-04-21-redesign-port-target.md` |
| 6 | **Add governance docs** (`CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`) | `[med / S / low]` | `ls` at repo root |
| 7 | **Decide release-tag flow + cut `v2.6.148` (or pause bumps)** | `[med / M / med]` | `git describe` + `package.json` — 81-commit drift. **Needs user.** |
| 8 | **Port `DashboardOverview.tsx` → Guild Summary** (B-R1) using merged `<SectionHeader>` | `[med / M / low]` | ADR execution plan |
| 9 | **Autoplay diversity — artist/album dedup scoring** (spec `docs/specs/2026-04-15-autoplay-diversity/`) | `[high / L / med]` | spec unchecked tasks |
| 10 | **Extract scoring helpers from `queueManipulation.ts`** (1,193 LOC) | `[high / L / med]` | LOC + D.1 prior |

## Critical security findings

- **None critical.** 2 moderate npm audits with fixes available (item #2 above) = the highest-leverage security move.
- 2 upstream-unfixed CVEs to monitor: `@hono/node-server` (CVE-2026-39406), `file-type` (CVE-2026-31808). Neither exposes public internet surface in ways we control.
- No secrets in tree. No orphaned lockfiles. GitGuardian green on all open PRs.

## Unblocks map

- **#1** → any future PR waiting on this one to land.
- **#2** → closes 2 of 4 Dependabot alerts; leaves only unfixable upstream.
- **#5** → precondition for #8 (branding guide drives page-port token choice).
- **#8** → template for the remaining 12 page-port PRs.
- **#10** → unblocks **#9** (dedup logic naturally placed in extracted scoring module).

## Open questions for user

1. Should we tag `v2.6.148` (81-commit drift is production-visible)?
2. Is `packages/frontend.zip` at repo root intentional or an accidental leftover export?
3. Is the team expected to grow beyond 1 (if so, flip branch protection required-review-count to 1)?

## Tracking

See `./tasks.md` for the execution task list.
