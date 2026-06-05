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
