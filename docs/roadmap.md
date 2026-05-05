# Roadmap — Lucky

_Refreshed 2026-05-05. Version: v2.9.0._

## Now (active)

- **queueManipulation.ts modularisation** — Split 961-LOC hotspot into `candidateSelection.ts`, `queueOrchestration.ts`, `queueEditOps.ts`. Unblocks multiple downstream refactors.
- **Autoplay tuning** — PR [#805](https://github.com/LucasSantana-Dev/Lucky/pull/805) in CI: artist exact-match routing, stop-clears-snapshot, Last.fm boost 0→0.20, deep-dive per-artist cap, mood cache.

## Next (proposed)

- **autoplay.ts split** — 1,074-LOC command file → `autoplaySettings.ts`, `autoplayDiversity.ts`, `autoplaySeeding.ts`.
- **Prisma homelab migration** — Apply `GlobalFeatureToggle` table migration to homelab DB. Run `npx prisma migrate deploy` on homelab after stop/start.
- **2026-04-24-autoplay-genre-locale**  _(proposed)_  `autoplay,music,i18n`

## Deferred

- **Phase 3: Stripe premium service** — Feature toggle placeholder active (`premiumService.isPremium`). DB schema staged. Deferred pending Phase 2 revenue validation.
- **GuildAutomationExecutionService event-driven refactor** — 1,238-LOC service. Candidate for event emitter pattern. Post-v2.9.
- **AutoMod.tsx decompose** — 984-LOC React component → 3-way split. Low priority.

## Recently shipped

- **v2.9.0: Admin panel + feature gates** — Global feature toggle management via web dashboard (`GlobalFeatureToggle` table, `requireAdmin` guard). `/artist` and `/album` gated behind toggles. PR [#801](https://github.com/LucasSantana-Dev/Lucky/pull/801), [#800](https://github.com/LucasSantana-Dev/Lucky/pull/800).
- **Test quality hardening** — Tightened false-positive assertions in music buttons and now-playing specs; all 2865 tests pass. PR [#804](https://github.com/LucasSantana-Dev/Lucky/pull/804).
- **v2.8.0: /artist and /album commands** — Last.fm-powered artist/album browsing with feature toggle gates. PR [#799](https://github.com/LucasSantana-Dev/Lucky/pull/799).
- **v2.7.0: Vercel feature flags migration** — Replaced Unleash with Vercel FeatureFlags. 19 flags live. PR [#796](https://github.com/LucasSantana-Dev/Lucky/pull/796).
- **Autoplay Phase 1+2** — `/artist`, `/album`, diversity scaling, Last.fm tag scoring, autoplay seed/diversity subcommands.
- **RBAC + guild access controls** — Role-based per-module permissions with `requireGuildModuleAccess` middleware.
