# Top-10 Priority Items — 2026-05-04 Backlog Map

**Generated:** 2026-05-04  
**Source:** `.claude/plans/backlog-2026-05-04.md`  
**Taxonomy:** Evidence-based backlog with impact/effort scoring

---

## Executive Summary

Top 10 priority items ranked by **impact/effort ratio** and **blocker status**. All items are either blocking downstream work, pose security risk, or represent concentrated tech debt.

---

## Priority Ranking

### 1. **A1: Merge PR #801 (Admin Panel)**
- **Status:** In review (UI + backend complete, E4 testing gap flagged)
- **Impact:** P0 — Unblocks self-serve guild settings, removes manual admin burden
- **Effort:** Low (code complete, test + review cycle)
- **Blocker:** YES — Frontend, self-serve, docs all awaiting merge
- **Next Action:** Add admin panel UI tests (E4), re-request review
- **Owner:** Feature team

### 2. **C1: Upgrade @hono/node-server to 0.4.0+**
- **Status:** Open dependabot alert (5 total: this + file-type, uuid, fast-xml-parser, swiftdiscord)
- **Impact:** P1 — CVE-2024-50334, security patch required
- **Effort:** Low (routine upgrade, verify CI)
- **Blocker:** YES — Security, must ship before next release tag
- **Evidence:** Identified in npm audit, Backend uses @hono/node-server
- **Next Action:** Merge dependabot PR or manual bump + test

### 3. **B1: Modularize queueManipulation.ts (953 LOC)**
- **Status:** 40% churn over 30 days, concentrated hotspot
- **Impact:** High — Reduces defect density, improves maintenance velocity
- **Effort:** Medium (3-4 files, refactor 400 LOC each)
- **Blocker:** Soft — Not blocking features, but blocks future music queue PRs from being reviewed efficiently
- **Modularization:** 
  - `candidateSelection.ts` — candidate filtering, genre/tag scoring
  - `queueOrchestration.ts` — queue sequencing, state transitions
  - `queueEditOps.ts` — splice, remove, clear, duplicate ops
- **Next Action:** Plan refactor in sprint, execute as P1 chore
- **Owner:** Backend team

### 4. **F1: Add Admin Panel UI Tests (E4)**
- **Status:** Soft blocker for PR #801 merge
- **Impact:** High — Ensures admin panel UX stability, reduces regression risk
- **Effort:** Low to Medium (E2E or Jest snapshots for settings, presets, table components)
- **Blocker:** YES (soft) — PR #801 review waiting on test coverage
- **Next Action:** Implement E2E or Jest tests for admin panel CRUD flows, add to pre-merge checklist
- **Owner:** QA / frontend team

### 5. **C2: Audit file-type Usage (MusicAnalysisService, GuildMusicService)**
- **Status:** Dependabot alert on user-input surface
- **Impact:** Medium — Potential input validation gap, music file parsing
- **Effort:** Low (1 audit session, ~2 files)
- **Blocker:** No — Non-blocking but P2 security hygiene
- **Next Action:** Verify file-type is only used on validated inputs; document findings
- **Owner:** Security / backend team

### 6. **B2: Refactor autoplay.ts (1,074 LOC)**
- **Status:** Largest single-file implementation, all autoplay subcommands co-located
- **Impact:** High — Improves readability, enables parallel feature development
- **Effort:** Medium (3-4 files, ~400 LOC each)
- **Blocker:** Soft — Blocks efficient review of autoplay feature PRs
- **Modularization:**
  - `autoplaySettings.ts` — enable/disable/config subcommands
  - `autoplayDiversity.ts` — genre/artist/tag diversity controls
  - `autoplaySeeding.ts` — seed, reset, preview subcommands
- **Next Action:** Plan post-PR#801, target next sprint
- **Owner:** Backend team

### 7. **G3: Refresh docs/roadmap.md**
- **Status:** 17 commits behind main, last regenerated 2026-04-15
- **Impact:** Medium — Reduces stakeholder confusion, aligns with actual state
- **Effort:** Low (1 session, ~2 hours)
- **Blocker:** No — Non-blocking but high stakeholder value
- **Content to Add:**
  - v2.8.0 release notes
  - PR #801 admin panel status
  - Phase 3 Stripe premium deferral rationale
  - Updated timeline for Phase 2 completion (music features shipped)
- **Next Action:** Regenerate roadmap after PR #801 merge
- **Owner:** Docs / product team

### 8. **H1: Clean 44 Stale Git Worktrees**
- **Status:** Identified via git worktree list; most branches merged >2 weeks ago
- **Impact:** Low — Improves disk space, CI cache clarity, cognitive load
- **Effort:** Low (parallel cleanup via git worktree remove, ~2 hours)
- **Blocker:** No — Nice-to-have housekeeping
- **Cleanup Pattern:**
  ```bash
  git worktree list | grep -E 'prunable|detached' | awk '{print $1}' | xargs -I {} git worktree remove {}
  ```
- **Next Action:** Schedule as P3 chore, execute mid-sprint
- **Owner:** DevOps / infra team

### 9. **B3: Audit playerFactory.ts (180 LOC, Known Hotspot)**
- **Status:** Known contributor to silence/now-playing bugs (per MEMORY.md)
- **Impact:** Medium — Reduces Discord-player bridge defects
- **Effort:** Low to Medium (audit + fix, ~1 session)
- **Blocker:** Soft — Non-blocking but high defect surface
- **Known Issues:**
  - `resetMocks: true` in Jest can wipe factory-time async impls
  - Silence/now-playing bugs often originate here (Sentry dedup)
- **Next Action:** Review error logs, trace silence/now-playing paths, add guards
- **Owner:** Backend team

### 10. **E4: Add Admin Panel UI Test Coverage**
- **Status:** Same as F1 (soft blocker for PR #801)
- **Impact:** High — PR #801 review gate
- **Effort:** Low to Medium
- **Blocker:** YES (soft)
- **Test Scope:**
  - Settings CRUD (enable/disable, config updates)
  - Presets table (pagination, sorting, filtering)
  - Error states (network failures, permission denied)
- **Next Action:** Implement before PR #801 merge
- **Owner:** QA / frontend team

---

## Deduplication vs. Prior Backlog (2026-04-25)

Only **3 items flagged status changes** from prior backlog:

1. **A3 (Release v2.8.0)** — ✅ SHIPPED (tag exists, root package.json synced)
2. **A4 (Dependabot alert count)** — Updated from 3 to 5 alerts (new: uuid, swiftdiscord)
3. **PR #801 (Admin Panel)** — Escalated from P1 to **P0 blocker** (in review, unblocks self-serve guild settings)

All other items carry forward from prior backlog with no status drift.

---

## Implementation Timeline

### Immediate (This Week)
- **A1:** Merge PR #801 + add E4 tests
- **C1:** Upgrade @hono/node-server
- **C2:** Audit file-type surfaces

### Next Sprint (1–2 weeks)
- **B1:** Begin queueManipulation.ts modularization
- **F1 / E4:** Complete admin panel test coverage
- **G3:** Regenerate roadmap

### Backlog (2–4 weeks)
- **B2:** Refactor autoplay.ts
- **B3:** Audit playerFactory.ts
- **H1:** Clean stale worktrees

---

## Evidence Sources

- **Git log:** 44 commits analyzed, 44 stale worktrees identified, 3 status changes
- **Dependabot alerts:** 5 open (npm audit, CI logs)
- **Source hotspots:** 6 files >800 LOC, 40% churn on queueManipulation.ts
- **PR status:** GitHub API, PR #801 in review, 0 open issues
- **Documentation:** docs/roadmap.md 17 commits behind, docs/specs/ directory audit
- **Release workflow:** GitHub Actions, tag-driven versioning, v2.8.0 release notes

---

## Notes

This prioritization reflects **impact/effort ratio** and **blocker status**. Items marked "Soft blocker" are high-value but non-critical; schedule them around immediate wins.

See `.claude/plans/backlog-2026-05-04.md` for full taxonomy (A–J), detailed evidence table, and deduplication context.

**Owner:** Lucky backlog team  
**Last Updated:** 2026-05-04  
**Review Cadence:** Weekly (after PR #801 merge, reassess Phase 3 scope)
