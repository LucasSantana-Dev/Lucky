# Autoplay mood clustering (#1095): hold and verify data first, don't override the Phase D gate

- Status: accepted (defer with verification triggers)
- Date: 2026-06-14

## Context

Issue #1095 proposes "audio-feature mood clustering": cluster autoplay candidates
by (energy, valence, tempo) relative to the current track and prefer in-cluster
candidates so the queue stays mood-coherent. It is labelled a "Phase D+ stretch."

The question raised: **override the deferred Phase D gate and build #1095 now, or
hold?**

Evidence (verified against `main`):

- **The Phase D gate is data-conditional.** `decisions/2026-05-21-autoplay-recommendation-roadmap.md`:
  "Ship Phase D **only if** the baseline acceptance-rate delta is large enough to
  justify the change. If Phase C shows the layered defense already produces **>85%
  acceptance per source**, Phase D becomes optional and gets deferred." Plus: "Hold
  Phase D for 7 days of production data minimum." #1095 is the roadmap's rejected
  "Pair B / mood-vector v2" — "adds behavioural complexity before there is data to
  tune."
- **The data source is at risk.** Mood features come from `getTrackAudioFeatures`
  → Spotify `GET /v1/audio-features` (`packages/bot/src/spotify/spotifyApi.ts`),
  which Spotify **deprecated for non-grandfathered apps on 2024-11-27** (403 for
  ineligible clients). Whether this app retains access is **unknown from code**.
  The fetch is **user-token-gated** (`getValidAccessToken(userId)`) — null for any
  user without a linked Spotify — and **logs-and-swallows to null** on any error,
  with **no telemetry on its production success rate**. So the existing audio-
  feature path may already be silently nulling for most tracks.
- **Audio features are already used** — `enrichWithAudioFeatures` in
  `candidateScorer.ts` applies energy/valence/tempo **delta penalties** to scores
  today. #1095's clustering is a _second-order refinement_ on this existing
  mechanism, not a greenfield capability.
- **The Phase C acceptance baseline was not retrieved** (no prod DB access this
  session), so the gate's own precondition is currently unevaluated.

A `critic` review (Opus) of the build-vs-defer question returned the same verdict
independently and did not flip it.

## Decision

**Do not override the gate. Hold #1095, gated on a cheap read-only verification
spike** that must pass _before_ any build decision. The roadmap already says Phase D
is conditional on Phase C data; #1095 (a Phase D+ stretch on a possibly-dead data
source) inherits that condition and adds a data-source viability check on top.

The spike (read-only, no code change) answers two facts and one analysis:

1. **Spotify audio-features prod success rate** (query 7 days of logs/Sentry for
   `getAudioFeatures` non-ok / 403 / null vs. success).
2. **Phase C per-source acceptance baseline** (`getPerSourceAcceptance` / `getSummary`
   over the last 7 days).
3. **`enrichWithAudioFeatures` efficacy** — what share of live score variance the
   existing energy/valence/tempo deltas already explain.

## Alternatives considered

- **Build now (override the gate).** Rejected. Risks spending effort on a feature
  that (a) the roadmap's own >85%-acceptance gate may render optional, and (b) may
  silently no-op because its Spotify data source is deprecated + user-token-gated.
  Worse, with no Phase C baseline there is nothing to measure the improvement
  against — unvalidatable by construction.
- **Close #1095 as not-viable now.** Rejected _as premature_ — it becomes correct
  only if the spike shows the audio-features source is effectively dead (<50%
  success). We shouldn't close it before the cheap check, but this is a live
  outcome of the spike, not a "never."
- **Hold-and-verify-first (spike, then decide).** Chosen. An afternoon of read-only
  telemetry resolves all three unknowns and routes to build / close / tune with
  evidence instead of assumption.

## Consequences

- Positive: no speculative behavioural complexity added to a 60-day battle-tested
  veto stack; the decision is routed to data; the spike also produces the Phase C
  baseline the whole roadmap needs.
- Negative: #1095 stays open and unshipped; the verification spike is itself a small
  piece of (read-only) work that needs prod access an agent doesn't have.
- Neutral: consistent with the telemetry-first autoplay roadmap and the
  measure-demand-before-building posture.

## Revisit when (concrete triggers — run the spike, then route)

- **Spotify success ≥75% AND Phase C acceptance <85% per source** → #1095 is
  justified; build behind a guild feature flag with an A/B gate (must beat the Phase
  C baseline by **>2% acceptance** to ship).
- **Spotify success <50%** → close #1095 as **not-viable** (data source degraded);
  audio-feature scoring should itself be reconsidered.
- **Phase C acceptance >85% per source** → close/defer #1095 as **optional** per the
  roadmap gate (the layered defense already wins).
- **`enrichWithAudioFeatures` already explains >40% of score variance** → #1095 is a
  tuning task on the existing penalizer, not a new clustering layer — rescope.

## References

- Issue #1095 — `feat(autoplay): audio-feature mood clustering`
- `decisions/2026-05-21-autoplay-recommendation-roadmap.md` (the Phase D data gate)
- `packages/bot/src/utils/music/autoplay/audioFeatures.ts`, `candidateScorer.ts` (`enrichWithAudioFeatures`)
- `packages/bot/src/spotify/spotifyApi.ts` (`getAudioFeatures` — deprecated endpoint, swallow-to-null)
- `packages/shared/src/services/recommendationTelemetryReadService.ts` (baseline read)
