# ADR 2026-08-03 — Autoplay re-measure: coverage gate PASSED, route to reliability + UX; skip-reason needs UX redesign

**Status:** Accepted
**Deciders:** Lucas Santana
**Closes the loop on:** `decisions/2026-07-01-autoplay-deploy-first-21d-measurement-window.md` (Decision §4 routing), `decisions/2026-06-24-autoplay-phase-c-baseline-defer-coherence-layer.md` (Phase D prerequisite: coverage >70%)
**Related issues:** #1646 (skipReason near-zero adoption), #1636 (extractor swap, now the top reliability item), #1095 (mood clustering, still on hold)

## Measurement (prod, run 2026-08-03 against homelab Postgres)

21-day window 2026-07-01 → 2026-07-22 (per the 2026-07-01 ADR):

| Metric | Result | Gate | Verdict |
|---|---|---|---|
| Outcome coverage | **75.6%** (121/160 resolved) | >70% | PASS |
| Acceptance rate | **0.950** | ≥0.85 | PASS |
| SPOTIFY_REC acceptance | 0.970 (82 picks) | — | not dead weight |
| SEED_SIMILAR acceptance | 0.926 (76 picks) | — | seed-similar wins |
| ARTIST_FALLBACK | 2 picks, 0 resolved | — | negligible volume |

Post-window (07-23 → 08-03): coverage **83.4%**, acceptance **0.950** — holding and improving without further changes.

`skipReason`: **2 rows lifetime** (was 0 on 2026-07-01). The pipeline works; adoption is effectively zero. This is the ADR's "#1646 = zero adoption" branch.

## Decision

**Autoplay recommendation quality is at the "good point." Per the 2026-07-01 ADR §4 routing: work shifts to reliability and UX.**

1. **Coverage gate is met** — the Phase D prerequisite from 2026-06-24 (coverage >70%) now holds. Phase D (coherence/ML personalization) may be re-evaluated on its merits; its remaining prerequisite is the `channelId` + time-bucket schema work. Phase D is *eligible*, not *scheduled*.
2. **No further scorer/signal tuning without new telemetry evidence.** The over-queueing diagnosis (#1589) is confirmed as the coverage root cause: coverage recovered from 22.5% to 75.6% after it deployed.
3. **Skip-reason signal: treat as zero-adoption, not a bug.** The emoji-prefill → reaction pipeline functions (2 rows), but users do not click. Per the revisit trigger: **the skip-reason feedback UX needs a redesign, not a fix.** Any redesign is a new, separate decision.
4. **Next autoplay work, in order:** (a) reliability — #1636 extractor swap evaluation; (b) UX items from `.claude/plans/2026-07-10-feature-mapping-research.md`; (c) #1095 mood clustering stays on hold pending its prod-access spike.

## Consequences

**Positive:** the measurement window delivered a conclusive read; the fix-loop is broken with evidence; two ADRs' routing branches are now resolved with data.
**Negative:** none beyond the cost of having waited for the window.
**Neutral:** ARTIST_FALLBACK stays as-is — 2 picks in 21 days does not justify work.

## Revisit when

- Coverage drops below 60% over any rolling 14 days (guard against silent regression — same query as this ADR).
- Phase D re-evaluation is actually proposed → requires the `channelId` + time-bucket schema ADR first.
- A skip-reason UX redesign is proposed → new decision record.
