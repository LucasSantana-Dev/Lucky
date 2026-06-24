# ADR 2026-05-21 — Autoplay recommendation system: telemetry-first roadmap

**Status:** Accepted — **Roadmap completed at Phase C (2026-06-24); coherence/personalization layer (Phase D) deferred.** Phase-C baseline showed >85% per-source acceptance (the pre-committed defer condition); see `decisions/2026-06-24-autoplay-phase-c-baseline-defer-coherence-layer.md`. (Original: sequencing decision; individual phases each ship behind their own PR.)
**Context-Pack:** Session 2026-05-21 — `/research-and-decide` on "improve the music recommendation system and fix any existent errors"
**Supersedes:** None (first ADR for this surface)
**Decision discipline:** critic-flipped (Phase 2 reversed the originally-proposed pair; see Alternatives)

## Context

Lucky's autoplay engine (`packages/bot/src/utils/music/autoplay/`) selects tracks and mounts a radio-like queue after every track ends. Over the last 60 days the system received **30+ commits**, including a 6-PR cluster fixing Spanish/gospel/sertanejo "drift" — autoplay surfacing cross-language or cross-genre tracks in non-matching sessions. The drift fixes have layered, building a stack of independent defenses:

- `GENRE_FAMILIES` hard-veto in `candidateScorer.ts` (scores → `-Infinity`)
- Cross-locale Spanish veto (`detectSpanishMarkers()` + locale check)
- Spotify-only seed search (no YouTube fallback) to prevent cross-language drift
- Spotify-genre fallback when Last.fm tags are missing
- Fuzzy-dedup with title/artist normalization
- Skip-storm relaxation (`recentSkipCount >= 3` → genre penalty × 0.5)

Telemetry: `RecommendationBasis { source, signals[] }` was introduced in PR #830 — but it's **serialized to a single `reason: String?` Prisma column at the `markAsAutoplayTrack` boundary and never deserialized**. The `Recommendation` model has `reason`, `isAccepted`, `isRejected`, `feedback` columns; **none are written by the replenisher**. The feedback loop is session-local (`recentSkipCount` only) — no persistent per-user/per-guild learning.

Decision archaeology gap: **zero ADRs** in `decisions/` for autoplay/recommendation despite the 30+ commits + Phase 3 module-extraction refactor.

The original framing of this research was: **"the drift-veto stack is the bottleneck; replace it with a session-coherence scorer."** The Phase 2 critic flipped that framing — see Alternatives below.

## Decision

Adopt a four-phase **telemetry-first roadmap**. Each phase is a separate PR with its own success criteria. Skipping phases inverts the dependency chain and ships observability theatre or unvalidated heuristic swaps.

### Phase A — Schema extension (prerequisite)

Extend the Prisma `Recommendation` model:

- `recommendationSource` — `enum RecommendationSource { SPOTIFY_REC | LASTFM_SIMILAR | LASTFM_TAG | SPOTIFY_LIKED | BROAD_FALLBACK | USER_HISTORY }`
- `recommendationSignals` — `Json[]` (array of signal records, structured matching `RecommendationBasis.signals`)
- Optionally split `feedback` into `acceptanceReason` / `rejectionReason` enums if the current free-text column has too little structure for downstream aggregation (decide after sampling production rows).

Backfill existing rows in a background job by parsing the serialized `reason` string. Keep `reason` (the human-readable serialization) as a denormalized convenience column — don't drop it.

### Phase B — Write closed-loop outcomes

`replenisher.ts` already imports `recommendationFeedbackService`. Extend it (or call a new `recordRecommendationOutcome()`) at two boundaries:

1. **At pick time:** insert `Recommendation { source, signals, … }`.
2. **At outcome time:** flip `isAccepted = true` if the track plays past 30% of duration without skip; flip `isRejected = true` if skipped within 5s of play start.

Heuristic thresholds (30%, 5s) are placeholders — first PR can ship with these and tune empirically once Phase C surfaces data.

### Phase C — Read path + baseline (7-day window)

Build a read-only `/recommendations history` query path that surfaces:

- Per-source 7-day acceptance rate
- Acceptance rate stratified by `signals[]` cluster
- Per-guild variance (some guilds may genuinely have broader/narrower taste than the global default — important for Phase D tuning)
- Skip-storm recovery speed: how quickly does acceptance rate recover after a `recentSkipCount >= 3` event?

This phase has **no risk of regression** (read-only). It produces the baseline against which Phase D is validated.

Hold Phase D for 7 days of production data minimum.

### Phase D — Session-coherence layer behind guild-level feature flag

After Phase C produces real numbers, add a `DriftDefensePolicy` object that **augments — does not replace — the layered vetoes**:

- Keep hard-rejection floors (Spanish markers, ambient noise, genre-family `-Infinity`) intact. They are tested by 60 days of production fixes.
- Add an optional session-coherence penalty (weighted by Phase C data) on top of the existing scorer.
- Gate behind a guild-level feature flag; A/B test against the baseline.
- Include a signature-decay mechanism: re-compute `sessionGenreFamilies` every 2–3 replenish cycles, weighting recent history more heavily, so skip storms reshape the signature instead of locking it in.

Ship Phase D **only if** the baseline acceptance-rate delta is large enough to justify the change. If Phase C shows the layered defense already produces >85% acceptance per source, Phase D becomes optional and gets deferred to a future ADR.

### Cross-cutting

In parallel with the above (separate PRs, not blocking the phases):

- **Retrospective ADRs** for the layered drift defense (genre-family veto, cross-locale veto, Spotify-only seed search). Captures the rationale of 6 PRs from the last 60d so a future agent does not unwind them. Owner: same session that wrote this ADR.
- **De-dup `lastFmSeeder.ts` + `lastFmSeeds.ts`** if Phase B/C work reveals overlap is causing duplicate API calls or scoring drift. Otherwise defer.
- **`/recommend` command** (currently OFF behind `MUSIC_RECOMMENDATIONS` toggle): keep deferred until Phase B has shipped — exposing the engine as an explicit user surface needs the closed-loop feedback to be useful.

## Alternatives considered

- **Originally proposed Pair A: deserialize `RecommendationBasis` end-to-end + replace layered vetoes with a session-coherence scorer.** Rejected by the Phase 2 critic on three concrete grounds, each verified:
    1. `Recommendation.reason: String?` is the only basis-related column. Deserialization-only ships observability that _looks_ closed-loop but isn't — without `recommendationSource` + `recommendationSignals` columns, per-source aggregation has no schema to land on. Phase A above closes this gap.
    2. The session-coherence scorer risks regression on the long-tail Spanish-gospel/sertanejo drift cases that the layered defense currently handles. Skip storms produce noisy session signatures, and a signature-based scorer would re-admit drift unless it explicitly preserves Spanish-marker and genre-family hard-rejection — at which point it's a re-implementation of the stack, not a replacement.
    3. `RecommendationSignal` enum conflates outcome-level signals (`completed before`, `skipped before`) with mechanism-level signals (`spotify preferred`, `genre family drift`). Counts of signals don't stratify by mechanism, so a histogram won't drive decisions. Phase A's schema extension separates source (mechanism) from signals (context); Phase B's outcome write closes the cause-vs-outcome gap.

- **Pair B: persistent per-user/per-guild skip-learning + mood-vector v2.** Rejected as a starting point (kept in the candidate pool for post-Phase-C re-evaluation). Both add behavioural complexity before there is data to tune them. Phase C may reveal that simple per-source acceptance rate already explains 80% of the win.

- **Pair C: ADRs-only.** Rejected as insufficient. Documentation matters but doesn't fix the write-only telemetry loop, which is the deeper architectural gap.

- **Pair D: do nothing; accept the drift defense as a permanent stack.** Rejected. The reactive-patch pattern over 60 days signals the stack is fragile to new edge cases; each new geographic/genre drift currently requires a new fix-commit. Phase D's session-coherence layer is the long-term answer once the baseline data exists.

## Consequences

### Positive

- The telemetry-first sequence ensures every behaviour change is validated against a baseline. No silent regressions.
- The schema extension (Phase A) closes the structural gap that turned PR #830's telemetry into write-only data.
- The roadmap explicitly preserves the layered drift defense — 60 days of production work isn't unwound.
- Retrospective ADRs (cross-cutting work) prevent the layered defense from being unwound by future agents who haven't seen the incident history.
- Each phase is independently mergeable. Lack of resources after Phase C is acceptable — Phase D becomes optional based on data.

### Negative

- Total scope is 4 PRs minimum (Phase A + B + C + retrospective ADRs). At 1 PR / 2-3 days, that's 1.5-2 weeks of intermittent work.
- Phase A is a Prisma schema migration. Lucky has had lockfile fragility around schema/dep changes recently (see PR #919 cascade). The migration needs to land cleanly with `--package-lock-only --ignore-scripts` patterns established in PR #921.
- Phase D is conditional on Phase C data being conclusive. If the baseline shows current acceptance rates are already high (>85% per source), Phase D becomes a "nice-to-have refactor" that the user may correctly choose to defer indefinitely.

### Neutral

- No user-facing behaviour change until Phase D ships (if it does). Phases A-C are observability work.
- The `MUSIC_RECOMMENDATIONS` toggle (currently OFF for `/recommend`) stays off through Phases A-C. Re-enable considered post-Phase B.

## Implementation plan (per phase)

**Phase A — schema** (≈1 PR, ≈2 days)

1. New migration: add `recommendationSource`, `recommendationSignals` columns. Keep `reason` denormalized.
2. Update `Recommendation` writers in `replenisher.ts` to populate the new columns.
3. Backfill job (script in `scripts/`, run once in production): parse existing `reason` strings → populate new columns. Tolerant of unparseable rows (leaves them null + logs to Sentry).
4. Tests: writer path + backfill script.

**Phase B — outcome write** (≈1 PR, ≈2 days)

1. Add `recordRecommendationOutcome()` to `recommendationFeedbackService`.
2. Wire into `player.on('playerFinish')` / `player.on('playerSkip')` (or equivalent discord-player hooks already in use).
3. Tests: outcome write hits the right rows + handles edge cases (skip < 5s, complete > 30%).

**Phase C — read path + dashboard** (≈1 PR, ≈3 days)

1. Backend `/recommendations/history` route with per-source 7-day aggregations.
2. Frontend surface in `/dashboard/<guild>/music` (or a new page) showing per-source acceptance rate.
3. Optional: weekly Sentry breadcrumb / metric for global acceptance rate.

Hold for 7 days of production data.

**Phase D — coherence layer** (≈1 PR, ≈4-5 days, conditional)

1. `DriftDefensePolicy` object that wraps the existing veto chain + optional coherence penalty.
2. Signature decay (re-center every 2-3 replenishes).
3. Guild-level feature flag.
4. A/B harness: track acceptance-rate delta vs control.

Rollback for any phase: revert the PR. Phases A and B are additive — old code paths still work without the new columns/writes if the data is absent.

## Revisit triggers

- **Phase C baseline shows >85% per-source acceptance across the board** → Phase D becomes optional. Promote this ADR's status to "Roadmap completed at Phase C; coherence layer deferred."
- **A new geographic/genre drift surfaces** (e.g., Korean ballad, J-pop, French chanson) **between Phase A and Phase D** → that drift gets a layered-veto patch in the existing style. Don't pre-emptively block on the coherence layer.
- **`@discordjs/opus` or `discord-player` major bump** changes the queue/replenish event shapes → revisit Phase B's outcome-write integration points.
- **`MUSIC_RECOMMENDATIONS` toggle flips ON** → revisit whether `/recommend` exposes the same engine (yes) or a separate one (no, currently). Likely just a wiring task at that point, but worth confirming in a follow-up ADR.
- **Lucky adds OpenSearch / Elasticsearch / a real analytics store** → Phase C read path migrates from Prisma aggregation to that store; current per-Postgres-query approach is fine for the 7-day window and current scale (hundreds of guilds, not thousands).

## Related artefacts

- PR #830 — original `RecommendationBasis` capture (now reframed as Phase 0)
- PR #810 — structured telemetry on replenishment (informs Phase C dashboard shape)
- PRs #780, #817, #818, #819, #820, #827 — the 6 drift-veto fixes that the layered defense layer is composed from. Retrospective ADRs (cross-cutting work item) should cover at minimum the rationale for #780 (hard-reject Spanish drift) and #827 (remove YouTube fallback).
- Issue: `MUSIC_RECOMMENDATIONS` toggle (currently OFF in `packages/shared/src/config/featureToggles.ts:17`)
- Memory: `~/.claude/projects/-Volumes-External-HD-Desenvolvimento-Lucky/memory/` — observation #3407 (PR #817 autoplay overhaul), #3410 (PR #818 locale filter), #3422 (PR #817 Spotify-genre fallback), #3448 (RecommendationBasis refactor PR #830), #3449 (PR #827 YouTube-fallback removal). The reactive-patch pattern these memories document is the load-bearing context for the telemetry-first sequencing.
