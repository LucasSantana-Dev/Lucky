# 2026-06-10 — Defer extraction of the autoplay/recommendation engine into a standalone OSS library

## Status

Accepted (defer — re-open on the explicit triggers below). Decider: Lucas Santana.

## Context

An extract-product scan flagged the music recommendation capability as Lucky's strongest
spin-off candidate (standalone OSS library / Lavalink-ecosystem companion). A
research-and-decide pass (5 parallel research units + critic review) was run to validate
the bet before investing. Key evidence:

1. **Spotify API is a dead end for consumers.** Recommendations / Audio Features /
   Audio Analysis are permanently restricted for all Spotify apps created after
   2024-11-27; Feb 2026 tightened dev mode further (5 users, 1 client ID, Premium
   required); extended access requires a registered business + 250k MAU. A library whose
   users register their own Spotify apps can never offer the Spotify path. Lucky's own
   pre-cutoff app retains grandfathered access — an advantage that is _not portable_.
2. **The cleanly-extractable code is not the engine.** `services/musicRecommendation/`
   (`MusicRecommendationService`) is a metadata-only cosine re-ranker that production
   never calls. The real engine is the autoplay stack
   (`utils/music/autoplay/replenisher.ts` + `candidateScorer.ts` + `diversitySelector.ts`
    - collectors, ~4k LOC) — production-critical and coupled to discord-player types,
      Prisma (`userArtistPreference`, `Recommendation`), Redis, and `@lucky/shared`.
      Extraction is a 2–3 month abstraction project (TrackLike protocol, injected
      persistence/logger/tag-fetcher), not a directory move.
3. **Demand is weak-to-absent.** Autoplay commoditized in 2026 client libs (LavaSrc,
   lavalink-client `autoPlayFunction`, DisTube `Queue#autoplay`, YouTube Mix fallback).
   Zero open autoplay issues in Lavalink core; addressable dev market ≈5–8k. Residual
   demand shifted to "smart autoplay" (preference learning) — which requires per-guild
   state that a library can't own, and which is precisely Lucky's full-stack advantage.
4. **ROI misalignment.** Lucky's strategic goal is full-stack adoption (self-hosted bot +
   dashboard). A library funnel ("bot devs adopt the lib → discover Lucky") is weak;
   2–3 months of solo-operator time would come out of dashboard/preference-learning work.
5. **Last.fm seed source is viable** (open registration, similar-track endpoints healthy,
   went independent May 2026, 5 req/s, non-commercial ToS) — so a Last.fm-based library
   is _possible_, just not currently worth it.

## Decision

**Defer extraction.** Keep the autoplay/recommendation engine inside Lucky and market it
as Lucky's differentiator ("smart autoplay that learns your server's taste"), not as a
separate product.

Optional zero-cost step (no commitment): expose the engine as a documented in-tree export
path (`@lucky/autoplay`-style, no backward-compatibility guarantee) so the code is visible
and learnable — convert to a published package only if adoption signals appear.

## Alternatives considered

- **A. Extract now as standalone OSS library** — rejected: wrong code is the portable
  part; real engine costs 2–3 months + ongoing maintenance; Spotify path unavailable to
  consumers; demand weak; ROI (reputation + funnel) does not materialize on evidence.
- **B. Keep internal, market as differentiator** — accepted as the active posture.
- **C. Defer with explicit re-open triggers** — accepted (this ADR).
- **D. In-tree export path** — optional adjunct to B; ~0 engineering cost.

## Consequences

- Positive: 2–3 months of solo capacity stays on Lucky's actual funnel (dashboard,
  preference learning, invite optimization). No new maintenance tail.
- Negative: if a real market window for a pluggable autoplay substrate opens, someone
  else may fill it first. Mitigated by revisit triggers.
- Neutral: legacy `MusicRecommendationService` (unused in production) is now documented
  as dead code — candidate for cleanup or for the Option D export experiment.

## Revisit when (any one trigger re-opens the decision)

1. Organic demand signal: an issue/discussion asking to reuse Lucky's autoplay in another
   bot/framework reaches ≥50 reactions, or ≥3 independent inbound asks.
2. Lavalink publishes an official plugin/SDK interface that makes a recommendation
   substrate higher-leverage.
3. A lightweight OSS per-guild preference-storage standard emerges (makes a learning
   library differentiated and feasible).
4. Operator has 2+ consecutive free weeks AND Lucky dashboard reaches its planned feature
   bar (extraction no longer cannibalizes the main quest).
5. Spotify reverses or relaxes the 2024-11-27 API restrictions for small apps.
