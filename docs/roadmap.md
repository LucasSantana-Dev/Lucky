# Roadmap — Lucky

_Refreshed 2026-05-04. Version: v2.8.0._

## Now (active)

- **Admin panel global toggles** — PR [#801](https://github.com/LucasSantana-Dev/Lucky/pull/801) in review. Self-serve guild feature flag management via web dashboard. Backend complete (`GlobalFeatureToggle` table, `requireAdmin` guard). Frontend form done.

## Next (proposed)

- **queueManipulation.ts modularisation** — Split 953-LOC hotspot into `candidateSelection.ts`, `queueOrchestration.ts`, `queueEditOps.ts`. Unblocks multiple downstream refactors.
- **autoplay.ts split** — 1,074-LOC command file → `autoplaySettings.ts`, `autoplayDiversity.ts`, `autoplaySeeding.ts`.
- **Prisma homelab migration guide** — Document `GlobalFeatureToggle` table migration for homelab DB (Phase 3 prerequisite).
- **2026-04-15-autoplay-diversity**  _(proposed)_  `autoplay,music,quality`
- **2026-04-24-autoplay-genre-locale**  _(proposed)_  `autoplay,music,i18n`

## Deferred

- **Phase 3: Stripe premium service** — Feature toggle placeholder active (`premiumService.isPremium`). DB schema staged. Deferred pending Phase 2 revenue validation.
- **GuildAutomationExecutionService event-driven refactor** — 1,238-LOC service. Candidate for event emitter pattern. Post-v2.9.
- **AutoMod.tsx decompose** — 984-LOC React component → 3-way split. Low priority.

## Recently shipped

- **v2.8.0: /artist and /album commands** — Last.fm-powered artist/album browsing with feature toggle gates. PR [#800](https://github.com/LucasSantana-Dev/Lucky/pull/800), [#799](https://github.com/LucasSantana-Dev/Lucky/pull/799).
- **v2.7.0: Vercel feature flags migration** — Replaced Unleash with Vercel FeatureFlags. 19 flags live. PR [#796](https://github.com/LucasSantana-Dev/Lucky/pull/796).
- **Autoplay Phase 1+2** — `/artist`, `/album`, diversity scaling, Last.fm tag scoring, autoplay seed/diversity subcommands.
- **RBAC + guild access controls** — Role-based per-module permissions with `requireGuildModuleAccess` middleware.
- **2026-04-15-internal-notify-endpoint**  _(shipped)_  `rag,backend,homelab`  →  PR: https://github.com/LucasSantana-Dev/Lucky/pull/625
