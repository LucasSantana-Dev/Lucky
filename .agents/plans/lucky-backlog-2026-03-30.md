# Lucky Discord Bot — Backlog Plan (2026-03-30)

## Context

Lucky is at v2.6.40 in production (Cloudflare Tunnel → homelab Docker). The release cadence has been healthy but left behind:

- 3 open PRs awaiting review/merge (#373, #378, dependabots)
- 4 stale local worktrees
- 15 stash entries (most are dead weight)
- Version drift: root `package.json` shows `2.6.38`, deployed tag is `v2.6.40`
- A defined UI redesign spec (docs/plans/2026-03-25-\*) with no implementation started

Work root: `/Volumes/External HD/Desenvolvimento/Lucky`

---

## Pre-Conditions

- [ ] On `main` branch and in sync: `git fetch origin && git reset --hard origin/main`
- [ ] Tests passing: `npm run test:bot`
- [ ] No pending Husky hook failures

---

## Phase 1: Unblock Open PRs (~1 hour)

**Goal:** Clear the three open PRs to keep the main branch advancing and avoid merge conflicts.

### Steps

1. **PR #378** — `test(bot): fix false positive tests from audit`
    - Already on this branch: `test/fix-false-positive-tests`
    - Verify CI is green: `gh pr checks 378`
    - Merge if green: `gh pr merge 378 --squash`

2. **PR #373** — `fix(bot): harden sentry integration and deploy wiring`
    - `gh pr checkout 373` → run `npm run test:bot` → verify type-check passes
    - Merge: `gh pr merge 373 --squash`

3. **Dependabot PRs** (#370, #371, #372)
    - `gh pr merge 370 --squash` (codecov action v6)
    - `gh pr merge 371 --squash` (dev-dep group)
    - `gh pr merge 372 --squash` (prod-dep group) — review security advisories first

### Verification

- [ ] `gh pr list --state open` shows 0 open PRs
- [ ] `npm run verify` passes on main

### Anti-Patterns

- Don't batch all dependabot PRs in one commit — squash each separately for clean history
- Don't merge dependabot prod-dep group without checking what changed (`gh pr diff 372`)

---

## Phase 2: Housekeeping — Version Drift + Stash/Worktree Cleanup (~30 min)

**Goal:** Align internal metadata with deployed state, clear dead worktrees and stashes.

### Steps

1. **Fix version drift**
    - Root `package.json` says `2.6.38`, deployed is `v2.6.40`
    - Bump to `2.6.40`: `npm version 2.6.40 --no-git-tag-version -w packages/bot -w packages/shared -w packages/backend -w packages/frontend`
    - Also bump root: edit `package.json` version field to `2.6.40`
    - Commit: `chore(release): align package.json version to v2.6.40`

2. **Stash cleanup**
    - Keep stash@{0} (most recent queue priority fix) — drop rest
    - `git stash drop stash@{1}` through `stash@{14}` (loop or manual)
    - Confirm with `git stash list`

3. **Worktree cleanup**
    - Inspect each: `git -C .worktrees/chore-priority-docs-metadata status` etc.
    - Remove merged/stale ones: `git worktree remove .worktrees/<name> --force`
    - Keep only if branch has commits not yet on main

### Verification

- [ ] `git stash list` shows ≤1 entry
- [ ] `git worktree list` shows only main worktree
- [ ] Root `package.json` version = `2.6.40`

---

## Phase 3: UI Redesign — Shell & Sidebar (~2 hours)

**Goal:** Begin implementing the redesign spec from `docs/plans/2026-03-25-lucky-screen-redesign-spec.md` — sidebar and app shell first (foundation for all pages).

### Context

The spec calls for Lucky to feel like a "guild command center" not a generic dashboard. Priority changes:

- Persistent guild block at top of sidebar (avatar, name, status, switch action)
- Primary nav groups: Overview / Moderation / Automation / Community / Media / Integrations
- Sharper section dividers, tighter spacing, strong active-item structure
- Replace generic card grids with task-based panels

### Steps

1. Create branch: `feature/ui-shell-redesign`
2. Read current `packages/frontend/src/components/layout/Sidebar.tsx` (or equivalent)
3. Implement persistent guild block:
    - Guild avatar (from Discord CDN via `guildId`)
    - Guild name + compact status line
    - "Switch server" action (navigate to `/servers`)
4. Reorganize nav groups per spec (6 primary groups)
5. Apply sharper styling: use `border-l-2` active indicator, `text-xs tracking-widest` group labels
6. Mobile: collapsible drawer instead of collapsed rail
7. Write/update component tests

### Key Files

- `packages/frontend/src/components/layout/` — sidebar, shell wrapper
- `packages/frontend/src/hooks/useGuild.ts` (or similar) — guild context
- `packages/frontend/src/App.tsx` — route layout
- Brand tokens: `#8b5cf6` (Lucky Purple), `#d4a017` (Lucky Gold), fonts: Sora/Manrope/JetBrains Mono

### Verification

- [ ] `npm run build --workspace=packages/frontend` succeeds
- [ ] `npm run test --workspace=packages/frontend` passes
- [ ] Visual check: sidebar shows guild block, 6 nav groups, active state by structure

### Anti-Patterns

- Don't introduce new dependencies without bundle impact check (bundle is ~3MB range)
- Don't redesign page content here — shell and sidebar only
- Don't use glassmorphism or vague gradients — spec explicitly bans this

---

## Phase 4: Autoplay Intelligence Follow-ups (~1 hour)

**Goal:** Implement the P3 backlog items from Serena: broader reason tags and feedback diversity constraints for autoplay recommendations.

### Steps

1. Create branch: `feat/autoplay-reason-tags`
2. Read `packages/bot/src/lib/music/autoplay/` recommendation logic
3. Add reason tags for:
    - Session novelty (already partially done in v2.6.39)
    - Artist diversity (prevent same artist 3x in a row)
    - BPM/energy similarity bucket
4. Add diversity constraint: max 2 tracks from same artist per replenish batch
5. Add unit tests covering new reason tags

### Key Files

- `packages/bot/src/lib/music/autoplay/index.ts`
- `packages/bot/src/lib/music/autoplay/recommendation.ts` (or similar)

### Verification

- [ ] `npm run test:bot` passes
- [ ] Autoplay replenish logs show new reason tags
- [ ] No same-artist runs > 2 in test scenarios

---

## Phase 5: Guild Automation RBAC Drift Fix (~45 min)

**Goal:** Reconcile Guild Automation route and command access after v2.6.33 dashboard addition created drift.

### Steps

1. Audit: `packages/backend/src/routes/guilds/automation.ts` — check middleware permissions
2. Audit: `packages/bot/src/commands/admin/` — any automation commands
3. Ensure `settings:manage` is required consistently across all automation endpoints
4. Add integration test for RBAC enforcement on automation routes
5. Commit as `fix(backend): harden guild automation route RBAC`

### Verification

- [ ] `npm run test:backend` passes
- [ ] Unauthorized request returns 403, not 200

---

## Phase 6: Ship

For each phase that produced code:

```bash
npm run lint && npm run type:check && npm run build && npm run test:ci
```

Update `CHANGELOG.md` with the phase's changes under the appropriate version block.

Conventional commit + PR per phase using `/pr-flow`.

---

## Interfaces / Contracts

- **Phase 3**: Sidebar component API changes — any parent that passes nav config must be updated
- **Phase 4**: Autoplay recommendation return type gains `reasonTags: string[]` — backwards-compatible
- **Phase 5**: No public API changes; internal route middleware hardening only

## Test Scenarios

- [ ] `npm run test:bot` — autoplay recommendation diversity constraints
- [ ] `npm run test:frontend` — sidebar renders guild block, 6 nav groups
- [ ] `npm run test:backend` — automation route returns 403 for unauthorized users
- [ ] `npm run verify` — full green gate before any PR

## Assumptions

- External drive at `/Volumes/External HD/Desenvolvimento/Lucky` is the canonical working directory
- Homelab SSH deploy runs after PR merges via `ssh server-do-luk`
- Sentry is production-only (disabled in dev), safe to test locally without real events

## Key Gotchas

- `HUSKY=0` for non-code commits (docs, config, version bumps)
- commitlint: lowercase subject, max 72 chars header
- Pre-commit runs lint-staged + commitlint — don't use `--no-verify`
- Worktree cleanup: use `git worktree remove --force`, not `rm -rf`
- Version bump: update ALL workspace package.json files, not just root
- `npm run build` required before running quality/coverage tests
- Git log fails on symlinked path — always use absolute path to external drive

## Out of Scope

- Last.fm scrobbling improvements
- Twitch EventSub changes
- New Discord slash commands
- Moderation system changes
- Backend infrastructure changes (Redis, Prisma schema)
- Full page redesigns beyond sidebar/shell (Phase 3 is shell only)
