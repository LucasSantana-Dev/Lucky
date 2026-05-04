# Tasks

_From `spec.md` Top-10. Ordered by impact / effort ratio. Source: `.claude/plans/backlog-2026-04-22.md`._

## Open

- [ ] **A.1** Ship PR #775 — dismiss stale CodeRabbit `CHANGES_REQUESTED` review (fix at `09aebe18` already addresses the sole comment).
- [ ] **A.2** Patch npm overrides: `follow-redirects >=1.15.12` + `hono >=4.12.14`; `npm install`; `npm audit` must clear both moderates.
- [ ] **A.3** Fix `validateBody` middleware and unskip `packages/backend/tests/integration/routes/management.test.ts:249` (AutoMod PATCH) + `:444` (Custom Commands POST).
- [ ] **A.5** Diagnose `packages/frontend/test-results/.last-run.json` `{status: failed, failedTests: []}`; rerun e2e, scrub artifact on success, add hook so CI never leaves inconsistent state.
- [ ] **B.1** Update `packages/frontend/branding/BRANDING_GUIDE.md` to reflect accepted ADR (Discord blurple + neon pink; Sora display + Manrope body). Doc-only PR.
- [ ] **B.5** Add governance docs at repo root: `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md` (one PR).
- [ ] **A.4** Release process: decide between cutting `v2.6.148` tag (81-commit drift behind package.json) vs pausing `chore(bump)` until release workflow unstuck. **Production-visible — requires user confirmation.**
- [ ] **B.2** Port `packages/frontend/src/pages/DashboardOverview.tsx` to "Guild Summary" layout using merged `<SectionHeader eyebrowIcon… statusBand…>`; update `DashboardOverview.test.tsx` snapshots.
- [ ] **B.4 / spec 2026-04-15-autoplay-diversity** Implement artist-dedup + album-dedup scoring penalties in `packages/bot/src/utils/music/autoplay/candidateScorer.ts`; add golden dataset fixtures.
- [ ] **D.1** Extract pure scoring helpers from `packages/bot/src/utils/music/queueManipulation.ts` (1,193 LOC) into `packages/bot/src/utils/music/scoring/`; no behavior change; move paired tests.
- [ ] **B.6** Bump `@secretlint/secretlint-rule-preset-recommend` 11.6.0 → 12.2.0 after reading 11→12 changelog; fix any new lint findings.
- [ ] **B.3** Redesign B-R4: consolidate `/twitch` + `/lastfm` + `/spotify` into `/integrations` with legacy redirects.
- [ ] **I.2** Re-run (or hand-update) `docs/roadmap.md`; 2026-04-15 regeneration missed ≥10 shipped items from the last week.

## Blocked / Needs decision

- [ ] **A.4** Release tag cut — awaiting user approval. Production-visible.

## Completed (this session, pre-spec)

- [x] PR #770 docs(references): gstack Supabase patterns — `ced4a072`.
- [x] PR #768 feat(prisma): flatten migrations / Supabase Phase 2 — `d903d210`.
- [x] PR #771 docs(env): DIRECT_URL in `.env.example` — `a3d3d2ee`.
- [x] PR #765 feat(frontend): SectionHeader eyebrowIcon + statusBand — `7f410185`.
- [x] PR #773 fix(bot): bound player track state with LRU + 30min TTL — `2a4d1e51` (parallel session).
- [x] PR #772 docs(redesign): port-target ADR + backlog-map spec — `b8b51eff` (parallel session).
- [x] PR #774 refactor(bot): type `discord-player-youtubei` dynamic import — `941b069b` (this session; closed D.3).
