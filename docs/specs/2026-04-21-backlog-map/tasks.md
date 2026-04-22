# Tasks

## Open

- [ ] Security: refresh npm lock state for `follow-redirects >=1.15.12` and `hono >=4.12.14`.
- [ ] Release process: restore GitHub release/tag flow for package version `v2.6.148` (latest tag stuck at `v2.6.132`). **Production-visible — needs user confirmation before tagging.**
- [ ] Autoplay diversity: start artist/album dedup in the existing `docs/specs/2026-04-15-autoplay-diversity/` spec (do not open a new spec).
- [ ] Music debt: extract a pure scoring/enrichment slice from `queueManipulation.ts` (1,193 LOC, high-churn).
- [ ] Redesign B-R4: collapse `/twitch` + `/lastfm` + `/spotify` into one `/integrations` page with legacy redirects.
- [ ] Redesign D-R2: update `branding/BRANDING_GUIDE.md` to match the redesign decision (dual accent: Discord blurple + neon pink; Sora display + Manrope body).
- [ ] Page ports (per ADR execution plan): 13 pages, one PR each, in priority order. A-R3 + B-R1 shipped the `<SectionHeader>` primitive; the `DashboardOverview` → "Guild Summary" port is still pending.

## Completed

- [x] Redesign A-R1: ADR — port-target decision. **Accepted 2026-04-21: Vite-port + dual accent + Sora/Manrope.** See `docs/decisions/2026-04-21-redesign-port-target.md`.
- [x] Redesign A-R2: short-form color token aliases added to `packages/frontend/src/index.css`. Landed in **#763** `feat(frontend): redesign token aliases + brand decision`.
- [x] Redesign A-R3: `<SectionHeader>` extended with `eyebrowIcon` + `statusBand`. Landed in **#765** `feat(frontend): SectionHeader eyebrowIcon + statusBand`. `DashboardOverview` "Guild Summary" port (B-R1) still open — see "Page ports" above.
- [x] PR #729: webhook new-code coverage merged 2026-04-22 (`ef069044`).
- [x] Security: `tar` Dependabot alerts closed by **#766** `chore(security): delete orphaned per-package pnpm-lock.yaml files` (not the original #755 path — lockfiles were orphaned, so the tar chain was dead code). #755 closed.
- [x] PR queue rebase sweep: ship-queue drained 2026-04-22 (#737, #740, #750, #751, #764, #768, #770, #771, #772, #773, #774, #766, #767, #769).
- [x] Shared constants: Top.gg vote tiers + bot ID live in `packages/shared/src/constants/topgg.ts`. Both `packages/backend/src/routes/webhooks.ts` and `packages/bot/src/functions/general/commands/voterewards.ts` import `TOP_GG_VOTE_TIERS` / `TOP_GG_BOT_ID` / `TOP_GG_VOTE_URL` from shared.
- [x] Backend validation: `validateBody` fixed and 400-on-invalid-body tests unskipped in **#769** `test(backend): unskip validateBody 400-on-invalid-body tests`.
- [x] Frontend tokens: dashboard accent/font direction settled on dual-accent (Discord blurple + neon pink) with Sora/Manrope/JetBrains Mono. Landed in **#763**.
- [x] Sonar PRs: new-code coverage failures on #737 and #740 cleared — both merged 2026-04-22 (#737 `a5808352`, #740 `e04d90e0`).
