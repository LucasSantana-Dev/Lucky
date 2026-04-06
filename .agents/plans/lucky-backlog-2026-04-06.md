# Lucky Discord Bot — Backlog Plan (2026-04-06)

## Goal

Ship v2.6.63, clean up stale infrastructure, refresh docs/memory, then tackle the next P2 roadmap features: `/session save` + `/session restore`.

## Context

Lucky is at v2.6.62 (released 2026-04-04) with 7 unreleased commits on `origin/main`. All P0/P1 roadmap items are shipped. Deploy pipeline is healthy (last 4 runs succeeded). 2500+ tests, all CI green.

### What changed since last backlog (2026-04-04)
- ✅ Shell/sidebar redesign (#479)
- ✅ Autoplay source diversity (#486)
- ✅ Presence rotation configurable (#487, #488)
- ✅ Version/autoplay command fix (#478)
- ✅ Vite 8.0.5 bump (#484)
- ✅ Deploy tunnel recovered

### What remains
- 9 stale worktrees, 18+ merged local branches
- `docs/IMPLEMENTATION_STATUS.md` stuck at v2.6.38 (24 versions behind)
- 2 open dependabot PRs (#482 prod deps, #485 dev deps)
- P2 roadmap: `/session save|restore`, `/playlist collaborative`, scheduled `/mod digest`

Work root: `/Volumes/External HD/Desenvolvimento/Lucky`

---

## Phase 0: Housekeeping (~20 min)

**Goal:** Sync local state, cut release, clean dead infrastructure.

### Steps

1. Fast-forward local main: `git pull --ff-only origin main`
2. Review + merge dependabot PRs (#482, #485)
3. Cut release v2.6.63 (CHANGELOG + version bump across all packages)
4. Remove stale worktrees (9 of them — all from merged/obsolete work)
5. Delete merged local branches

### Verification

- [ ] `git log --oneline -1` matches `origin/main`
- [ ] `gh pr list --state open` shows 0 (or only new dependabots)
- [ ] `git worktree list` shows only main worktree
- [ ] `git branch --merged main | wc -l` is minimal

---

## Phase 1: Docs & Memory Refresh (~20 min)

**Goal:** Bring operational docs and memory to current state so future sessions start clean.

### Steps

1. Rewrite `docs/IMPLEMENTATION_STATUS.md` from v2.6.38 → v2.6.63
2. Archive `.agents/plans/lucky-backlog-2026-03-30.md` (move to `.agents/plans/archive/`)
3. Move `BACKLOG_MAP.md` from worktree to main (if valuable) or discard
4. Update `lucky-bot.md` memory with current version, test counts, completed features
5. Sync memories via `/sync-memories`

### Verification

- [ ] `IMPLEMENTATION_STATUS.md` references v2.6.63
- [ ] No stale planning docs referencing v2.6.38-40

---

## Phase 2: /session save & /session restore (~2.5 hours)

**Goal:** Implement the P2 roadmap feature: named session save/restore for music queues.

### Design

- `/session save <name>` — serialize current queue (tracks, order, requester, position) to Redis with guild+user key
- `/session restore <name>` — deserialize and rebuild queue from saved state
- `/session list` — show saved sessions for current guild
- `/session delete <name>` — remove a saved session
- Storage: Redis hash `session:{guildId}:{name}` with 30-day TTL
- Permission: anyone can save, only session owner or mod can delete others' sessions
- Max 10 sessions per guild (configurable via env var)

### Key Files

- `packages/bot/src/commands/music/session.ts` — new command file
- `packages/bot/src/lib/music/session/SessionService.ts` — business logic
- `packages/shared/src/services/redis/` — Redis key patterns
- `packages/bot/src/lib/music/queue/` — queue serialization helpers

### Steps

1. Create `SessionService` with save/restore/list/delete methods
2. Create `/session` command with 4 subcommands
3. Add queue serialization/deserialization helpers (reuse snapshot logic)
4. Write unit tests for SessionService
5. Write command handler tests
6. Integration test: save → clear → restore → verify queue matches

### Verification

- [ ] `npm run test:bot` passes with new session tests
- [ ] `npm run verify` full green gate
- [ ] Manual: `/session save test` → `/stop` → `/session restore test` → queue restored

---

## Phase 3: Dashboard Overview Page (~2 hours)

**Goal:** Now that the shell/sidebar is shipped, build the first content page: server overview.

### Design

- Guild stats cards: member count, active moderators, music sessions today, automation triggers
- Quick action buttons: configure modules, view recent cases, open music queue
- Activity feed: last 10 events (joins, bans, automod triggers, music plays)
- Uses existing backend API endpoints + new `/api/guilds/:id/overview` aggregate endpoint

### Key Files

- `packages/frontend/src/pages/guild/Overview.tsx` — new page
- `packages/backend/src/routes/guilds/overview.ts` — aggregate endpoint
- `packages/frontend/src/components/guild/` — stat cards, activity feed components

### Verification

- [ ] `npm run build --workspace=packages/frontend` succeeds
- [ ] `npm run test --workspace=packages/frontend` passes
- [ ] `npm run test --workspace=packages/backend` passes
- [ ] Visual: overview page renders stats and activity

---

## Phase 4: Ship

For each phase that produced code:

```bash
npm run lint && npm run build && npm run test:all
```

Update CHANGELOG.md, conventional commit + PR per phase.

---

## Interfaces / Contracts

- **Phase 2**: New `SessionService` class + `/session` command. No breaking changes to existing queue.
- **Phase 3**: New `/api/guilds/:id/overview` endpoint. New frontend page component. No existing route changes.

## Out of Scope

- `/playlist collaborative` (deferred to next session)
- Scheduled `/mod digest` (deferred — on-demand `/digest` already works)
- Full page redesigns beyond overview (settings, moderation, etc.)
- Prisma schema changes (session data lives in Redis, not PostgreSQL)
- Mobile responsive redesign
- Unleash feature flag infrastructure changes

## Dependencies

- Phase 0 must complete before Phase 1 (need synced main for accurate docs)
- Phase 2 and Phase 3 are independent (can parallelize with worktrees)
- Phase 4 depends on all prior phases
