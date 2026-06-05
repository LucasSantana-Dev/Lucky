# ADR 2026-06-04 — Redundancy consolidation across bot/shared

**Status:** Accepted
**Scope:** `/refactor-pipeline` run — target "redundancy consolidation"
**Plan:** `.claude/plans/redundancy-consolidation-2026-06-04.md`

## Context

A discovery pass (4 parallel scans) flagged duplicated/divergent utilities that
risk drift: multiple `formatDuration` implementations, two embed-validation paths,
and duplicated `interactionReply`/`deferredInteractionReply` across `bot` and
`shared`. Each duplicate is a place where a fix can land in one copy and silently
miss the other.

## Decision

Consolidate to a single source per concern, **placing each util where its usage
actually lives** (not reflexively in `shared`):

1. **`formatDuration` → one bot util** (PR #1212). Usage is bot-only (Discord
   embeds), so the canonical home is `packages/bot/src/utils/general/formatDuration.ts`
   (`formatDurationClock`, `formatDurationHuman`), NOT `@lucky/shared`. 7 impls → 1.
   `slowmode`'s distinct short format (`5m`/`disabled`) was intentionally left as-is.
   Note: the clock helper is hours-aware, so durations ≥1h now render `H:MM:SS`
   instead of overflowed `M:SS` — an intended correctness fix.

2. **`interactionReply` / `deferredInteractionReply`: delete the DEAD shared copies.**
   Investigation showed `shared`'s copies (and bot's `deferredInteractionReply`) had
   **zero consumers** — all 85 bot import sites use the LOCAL bot `interactionReply`.
   The shared copies were dead duplicates that had already drifted (e.g. localized
   strings, error handling) from bot's live version. Removed:
   `shared/.../interactionReply.ts` (+ its spec, the only consumer),
   `shared/.../deferredInteractionReply.ts`, `bot/.../deferredInteractionReply.ts`.
   bot's live `interactionReply.ts` (the canonical, Discord-specific impl, hardened
   for Sentry capture in #1175) stays in `bot`.

3. **`validateEmbedData`: already single-source** (PR #1179) — it delegates to the
   shared `embedDataSchema` (Zod). Verified. `backend/src/schemas/embeds.ts` is a
   DIFFERENT, richer model (full Discord embed: `url`, `author`, structured
   `{url}` thumbnail/image/footer) for the management API — legitimately separate,
   NOT merged.

4. **`COMMAND_CATEGORIES`: DEFERRED.** bot and shared have genuinely diverged
   (different category sets AND label language — bot EN superset vs shared PT subset).
   Unifying needs a product decision (canonical label language + taxonomy) that
   touches user-facing strings; not force-merged.

## Alternatives considered

- _Move `interactionReply` into `@lucky/shared`_ — rejected: it's Discord.js-specific
  and bot-only; sharing it would pull discord.js typing concerns into shared for no
  consumer. The dead shared copy was cruft, not a candidate SoT.
- _Force-merge `COMMAND_CATEGORIES`_ — rejected: would silently change displayed
  category labels (PT↔EN); a product/i18n decision, not a mechanical refactor.

## Consequences

- **Positive:** drift surface eliminated (one `formatDuration`; no dead duplicate
  interaction-reply utils); clearer ownership (Discord utils live in bot).
- **Negative/neutral:** `formatDuration` ≥1h render change (correctness improvement,
  flagged). `COMMAND_CATEGORIES` split-brain remains until decided.

## Revisit when

- The `COMMAND_CATEGORIES` i18n + taxonomy decision is made (likely a
  `/research-and-decide`) — then consolidate to a single definition.
