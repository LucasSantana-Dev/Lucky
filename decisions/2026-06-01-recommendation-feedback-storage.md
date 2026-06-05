---
status: accepted
date: 2026-06-01
refines: 2026-05-31-redis-scope-reduction
revisit_after: when a revisit trigger below fires
---

# Recommendation feedback: explicit→Postgres, artist→unify on userArtistPreference, implicit→in-memory

## Status

Accepted. Refines [[2026-05-31-redis-scope-reduction]]. Decided via research + Opus
`critic` (ACCEPT, no flip).

## Context

`RecommendationFeedbackService` (`packages/bot/src/services/musicRecommendation/feedbackService.ts`)
stores autoplay feedback in THREE Redis maps (per-user JSON blobs, `setex`):

1. **explicit** `music:feedback:{userId}` — per-track 👍/👎, 30d TTL, time-decayed weight
   (`decayWeight`). Redis-only SoT. Written by Discord commands; read by the autoplay replenisher.
2. **artist** `music:artist_feedback:{userId}` — per-artist prefer/block, 30d TTL.
   **SPLIT-BRAIN:** the bot writes Redis-only (`setArtistFeedback`), but reads MERGE Redis +
   the Postgres `userArtistPreference` table — and the **backend** (`artistSuggestion.ts`,
   web-UI "Preferred Artists") writes prefer/block to that SAME table. Set an artist via
   Discord vs the web UI → the two stores diverge. Same bug class as GuildSettings.
3. **implicit** `music:implicit_feedback:{userId}` — behavioral implicit_like/dislike, 14d TTL,
   hard-capped at the 200 most-recent. Redis-only. Written by player trackHandlers (skip/replay).

Feedback biases autoplay quality only — losing it degrades recommendations, breaks nothing
(no correctness stake beyond the split-brain). Single instance, co-located Postgres.

## Decision

Three maps, three answers (by data class, not one bucket):

1. **explicit → Postgres** — new `UserTrackFeedback` table (guildId, discordUserId, trackKey,
   feedback, updatedAt, expiresAt). Lazy-TTL-prune on read (same pattern as the other
   migrations this session). Decay weight stays a read-time computation.
2. **artist → unify on the existing `userArtistPreference` table** — kills the split-brain.
   The Discord write path (`setArtistFeedback`/`removeArtistFeedback`) writes
   `prisma.userArtistPreference` directly (upsert/delete), exactly like the backend already
   does. The read path drops the Redis merge and reads Postgres only. Service methods stay as
   thin wrappers so the ~5 call sites are unchanged.
3. **implicit → in-memory** (`Map` + 14d TTL + 200 cap). Most ephemeral, behavioral; loss on
   restart = a temporary autoplay-personalization dip for ~14d, acceptable single-instance.

## Alternatives considered

- **A — all three → Postgres.** Rejected: implicit is behavioral/ephemeral/capped; a table +
  prune job for signal that's fine to lose on restart is overkill for a hobby bot.
- **C — keep Redis.** Rejected: leaves the live artist split-brain + undercuts pub/sub-only.
- **D — defer entirely.** Rejected: the artist split-brain is a live divergence bug; the
  explicit/implicit moves are cheap riders once we're in the file.

## Consequences

Positive: kills the artist split-brain (one write path: Postgres); explicit feedback survives
restarts; 3 fewer Redis consumers; implicit simplifies to an in-memory Map. Per-store cutover
is atomic (read+write switch in the same PR) so no cross-PR split-brain window.

Negative / accept: a new `UserTrackFeedback` table + migration. Postgres reads on the autoplay
replenisher path (off the per-message hot path — runs on queue-empty). No backfill of current
Redis feedback — it ages out under its own 30d/14d TTL; users rebuild quickly (acceptable,
quality-only). Implicit lost on restart (single-instance only).

## Revisit when

- Bot goes multi-instance → in-memory implicit map breaks; move it to Postgres then.
- Replenisher Postgres read latency becomes measurable → add an in-process cache.
- Explicit-feedback table grows unbounded despite TTL → add a periodic sweep alongside lazy prune.

## Implementation notes (for the PR, not the decision)

Per critic: per-store atomic cutover (read + write in one PR). `setArtistFeedback` becomes a
thin Postgres wrapper, not deleted (call sites unchanged). Add a `// REVISIT multi-instance`
note at the in-memory implicit map. The existing `Recommendation` telemetry model is separate —
do NOT fold feedback into it.
