# Tasks — Backlog Map 2026-04-25

Tracks the Top-10 items from `spec.md`. Update statuses as PRs land.

## Open

- [ ] **A.4** Verify `@hono/node-server` v1.18.x is patched for GHSA-92pp-h63x-v22m or add path-normalization pre-handler in `packages/backend/src/server.ts`. Owner: TBD.
- [ ] **A.1** Sweep dependabot PRs:
  - [ ] #783 trufflehog SHA bump
  - [ ] #784 pnpm/action-setup 4 → 6
  - [ ] #785 dev-dependencies group (8 updates)
  - [ ] #786 production-dependencies group (17 updates)
- [ ] **A.2** Cut release tag `v2.6.148` (needs user approval).
- [ ] **A.5** Dismiss Dependabot alert for `uuid` GHSA-w5hq-g745-h8pq as not-exploitable here (only `v4` used).
- [ ] **A.3** Run `commit-commands:clean_gone` skill + manual audit of `.claude/worktrees/agent-*` locked entries.
- [ ] **B.7** Update `packages/frontend/branding/BRANDING_GUIDE.md` to dual-accent (Discord blurple + neon pink) per accepted ADR.
- [ ] **E.1** Move `-Infinity` early-return into `upsertScoredCandidate` in `packages/bot/src/utils/music/queueManipulation.ts`; remove the 3 in-place guards.
- [ ] **B.1** Split `queueManipulation.ts` into ≤4 modules along the existing `replenish` / shuffle / move / rescue boundaries.
- [ ] **B.6** Open implementation branch for `docs/specs/2026-04-15-autoplay-diversity/`.
- [ ] **B.4** Split `packages/bot/src/functions/music/commands/autoplay.ts` per subcommand.

## Done since 2026-04-22 backlog (carryover)

- [x] **#780** Phase 1 — hard-reject Spanish autoplay drift (`70c30997`).
- [x] **#782** Phase 2 — tag-driven autoplay scoring (`610423d0`). Dropped 240 LOC dedup from `queueManipulation.ts` (1,193 → 953).
- [x] Dismissal-via-API + `resolveReviewThread` recipe captured as `feedback_pr_blocked_thread_resolution.md`.
- [x] PR-retarget CI re-trigger captured as `feedback_pr_retarget_no_ci.md`.

## Notes

- `pnpm outdated` could not be run cleanly (root invocation deferred; lockfile gap from #766 cleanup); revisit before next /plan run.
- The two `validateBody` skipped tests from prior backlog are gone (covered by #769 + later cleanup).
- 0 open issues, 0 failing CI runs in last 14 days.

## Supersedes

- `docs/specs/2026-04-22-backlog-map/spec.md`
- `docs/specs/2026-04-22-backlog-map/tasks.md`
