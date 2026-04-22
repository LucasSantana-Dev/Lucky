---
status: proposed
created: 2026-04-21
owner: lucassantana
pr:
tags: backlog,roadmap,maintenance
---

# backlog-map

## Goal

Turn the 2026-04-21 backlog map into tracked maintenance work without duplicating the existing autoplay diversity spec.

## Evidence Source

Primary map: `.claude/plans/backlog-2026-04-21.md`.

Top 10 promoted items:

1. PR #729 new-code coverage for Top.gg webhook routes.
2. High `tar` Dependabot alerts in `packages/bot/pnpm-lock.yaml`.
3. All 10 open PRs are behind `origin/main`.
4. Top.gg vote tiers and bot ID duplicated between backend and bot.
5. npm audit lock drift for `follow-redirects` and `hono`.
6. Two skipped backend management invalid-body tests.
7. Release/tag drift: latest release `v2.6.132`, package version `2.6.148`.
8. Existing autoplay diversity spec remains unchecked.
9. Frontend dashboard brand/font tokens are still split between neon and blurple/Sora/Manrope.
10. `queueManipulation.ts` is high-churn and 1,193 LOC.

## Redesign Migration (added 2026-04-21 evening pass)

Reference repo: `github.com/LucasSantana-Dev/Lucky-redesign` (private, Next.js 15 App Router prototype, mocked data only). AI Studio app: `1fd5d19a-c793-4190-a354-777d6295bfd1`. Detailed gap analysis: `.claude/plans/backlog-redesign-2026-04-21.md`.

Anchored items added to Top 10:
- A-R1: port-target ADR (Vite-port recommended over Next migration).
- A-R2: token short-form aliases in `index.css`.
- A-R3 + B-R1: `<SectionHeader>` status band + `DashboardOverview` "Guild Summary" port.
- B-R4: collapse three integration pages into one `/integrations`.

## Verification

- Each task links back to command/file evidence in `.claude/plans/backlog-2026-04-21.md` or `.claude/plans/backlog-redesign-2026-04-21.md`.
- Do not create duplicate specs for autoplay diversity; update `docs/specs/2026-04-15-autoplay-diversity/` instead.
- Refresh `docs/roadmap.md` after this spec is accepted or shipped.
