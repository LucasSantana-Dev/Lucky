# Next Priorities (2026-03-16)

## P0 (Pending merge)
- PR #302 — fix(lint): remove unused params in lucky-policy-lib.mjs — MERGED
- PR #303 — chore(deps): patch/minor dep updates Mar 2026 — open, CI running, auto-merge enabled

## P1 (Next features)
No open issues. Potential enhancements identified from codebase:
1. **Guild automation / RBAC** — `packages/shared` has skeleton for automation manifests; not yet wired to bot commands
2. **Playback analytics dashboard** — track history stored in DB, frontend `/music/history` route exists; no charts/stats view
3. **Rate limit UI** — provider health cooldown in Redis/bot; no admin command to view current cooldown state
4. **Auto-message scheduling** — `AutoMessageService` supports trigger-based; could add cron-based scheduled messages
5. **Queue persistence** — current queue is in-memory; persisting to Redis on graceful shutdown would allow bot-restart recovery

## P2 (Housekeeping)
1. Update Serena memories after PR #303 merges (current state will be v2.6.25)
2. Audit major dep bumps (vite 7→8, zod 3→4) when time allows
3. Cleanup: 0 worktrees currently (all stale ones removed)

## Out of Scope (do not re-raise)
- PR #268 (smartshuffle) — merged in v2.6.24
- PR #269 (mod digest) — merged in v2.6.24
- npm audit — 0 vulnerabilities (CLEAN)
