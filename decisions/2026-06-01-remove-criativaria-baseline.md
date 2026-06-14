# Remove Criativaria Baseline Dashboard Feature

**Date:** 2026-06-01  
**Status:** Accepted  
**Owner:** Lucas Santana

## Context

The dashboard "Criativaria Baseline" was a hardcoded legacy-server preset designed to migrate guilds from older bot setups with safe reconcile defaults. This feature existed only in the frontend web dashboard and backend API; it was a general-purpose bot artifact that should not ship.

The separate bot `/serversetup criativaria` command (in `packages/bot/src/functions/management/commands/helpers/serversetupCriativaria.ts`) is intentionally left intact as a distinct template and is out of scope for this decision.

## Decision

Remove the "Criativaria Baseline" feature entirely:

- **Frontend:** ServerSettings page UI section, handler, state, and API service calls
- **Backend:** Route `/api/guilds/:guildId/automation/presets/criativaria/apply`, preset builder, and route tests
- **Backend constants:** Delete `packages/backend/src/constants/guildAutomationPresets.ts` (only contained `buildCriativariaPreset`)
- **Docs:** Remove "Notifying for Criativaria" example from TWITCH_SETUP.md

The bot's `/serversetup criativaria` command remains available and is tracked separately.

## Consequences

- Streamlined dashboard: removed hardcoded legacy-server preset UI
- Simpler backend constants: eliminated preset builder file
- No user-facing impact: the feature was internal and rarely used post-v2.11

## Revisit

Never; feature retired by decision.

## Addendum 2026-06-14 — bot `/serversetup criativaria` tracking resolved (#1288)

#1288 flagged that the bot command, kept per the original decision, was "tracked separately" with nothing actually tracking it. Resolved: the command IS instrumented at `packages/bot/src/functions/management/commands/serversetup.ts` — Prometheus counter `guildAutomationUsageTotal{operation="criativaria"}` (line 315) and a structured `serversetup: criativaria invoked` log carrying guildId/userId/mode (lines 307–314). The demand-measurement precondition is therefore satisfied.

Decision: KEEP the command, instrumented. Defer removal until a usage review on 2026-07-14. If invocations are zero/negligible by then, run the standard feature-removal sweep (file + serversetup.ts choice/handler/imports + both spec files + this ADR). Tracking issue: #1288.
