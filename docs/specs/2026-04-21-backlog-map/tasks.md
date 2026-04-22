# Tasks

- [ ] PR #729: add webhook new-code coverage until Sonar reports >=80%.
- [ ] Security: merge or replace #755 so open high `tar` Dependabot alerts close.
- [ ] PR queue: update all open PRs from `origin/main` and re-read failing checks.
- [ ] Shared constants: move Top.gg vote tiers and bot ID into `@lucky/shared`.
- [ ] Security: refresh npm lock state for `follow-redirects >=1.15.12` and `hono >=4.12.14`.
- [ ] Backend validation: fix `validateBody` behavior and unskip two management invalid-body tests.
- [ ] Release process: restore GitHub release/tag flow for package version `2.6.148`.
- [ ] Autoplay diversity: start artist/album dedup in the existing 2026-04-15 spec.
- [ ] Frontend tokens: choose one dashboard accent/font direction and apply in `packages/frontend/src/index.css`.
- [ ] Music debt: extract a pure scoring/enrichment slice from `queueManipulation.ts`.
- [ ] Sonar PRs: fix new-code coverage failures on PRs #737 and #740.
- [x] Redesign A-R1: ADR — port-target decision. **Accepted 2026-04-21: Vite-port + dual accent + Sora/Manrope.** See `docs/decisions/2026-04-21-redesign-port-target.md`.
- [ ] Redesign A-R2: add `--color-canvas/sidebar/panel/elevated/highlight/brand-discord/brand-accent/text-strong/body/muted/subtle` aliases to `packages/frontend/src/index.css`.
- [ ] Redesign A-R3 + B-R1: extend `<SectionHeader>` with `eyebrowIcon` + `statusBand`; port `pages/DashboardOverview.tsx` to "Guild Summary" layout.
- [ ] Redesign B-R4: collapse `/twitch` + `/lastfm` + `/spotify` into one `/integrations` page with legacy redirects.
- [ ] Redesign D-R2: update `branding/BRANDING_GUIDE.md` to match the redesign decision (dual accent: Discord blurple + neon pink; Sora display + Manrope body).
