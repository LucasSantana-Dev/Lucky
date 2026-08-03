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

1. **Coverage prerequisite met; Phase D stays DEFERRED.** The 2026-06-24 revisit condition has two clauses: coverage >70% **AND** a re-measured per-source acceptance **below 85%**. Only the first fired — per-source acceptance is 0.926–0.970, comfortably above 85% on a now-real (non-blind) basis. Per the pre-committed gate, **Phase D (coherence/ML personalization) remains deferred**; the system does not need it. The `channelId` + time-bucket schema work is therefore not urgent either — it is only a prerequisite *for* Phase D.
2. **No further scorer/signal tuning without new telemetry evidence.** The over-queueing diagnosis (#1589) is confirmed as the coverage root cause: coverage recovered from 22.5% to 75.6% after it deployed.
3. **Skip-reason signal: treat as zero-adoption, not a bug.** The emoji-prefill → reaction pipeline functions (2 rows), but users do not click. Per the revisit trigger: **the skip-reason feedback UX needs a redesign, not a fix.** Any redesign is a new, separate decision.
4. **Next autoplay work, in order:** (a) reliability — #1636 extractor swap evaluation; (b) UX items from `.claude/plans/2026-07-10-feature-mapping-research.md`; (c) #1095 mood clustering stays on hold pending its prod-access spike.

## Consequences

**Positive:** the measurement window delivered a conclusive read; the fix-loop is broken with evidence; two ADRs' routing branches are now resolved with data.
**Negative:** none beyond the cost of having waited for the window.
**Neutral:** ARTIST_FALLBACK stays as-is — 2 picks in 21 days does not justify work.

## Reproduction

Definitions (mirror `recommendationTelemetryReadService`):

- **coverage** = (`isAccepted` OR `isRejected`) / total picks in window
- **acceptance** = `isAccepted` / (`isAccepted` + `isRejected`) — pending excluded

Exact query (run 2026-08-03 against homelab prod; window bounds `[start, end)` on `createdAt`, DB timestamps UTC):

```sh
ssh homelab 'docker exec -i lucky-postgres sh -c '"'"'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'"'"''
```

```sql
-- coverage + acceptance, window [2026-07-01, 2026-07-23)
SELECT count(*) AS picks,
  count(*) FILTER (WHERE "isAccepted" OR "isRejected") AS resolved,
  round(100.0*count(*) FILTER (WHERE "isAccepted" OR "isRejected")/nullif(count(*),0),1) AS coverage_pct,
  round(count(*) FILTER (WHERE "isAccepted")::numeric/nullif(count(*) FILTER (WHERE "isAccepted" OR "isRejected"),0),3) AS acceptance_rate
FROM "recommendations"
WHERE "createdAt" >= '2026-07-01' AND "createdAt" < '2026-07-23';

-- per-source acceptance, same window
SELECT coalesce("source"::text,'(null)') AS source, count(*) picks,
  count(*) FILTER (WHERE "isAccepted") acc, count(*) FILTER (WHERE "isRejected") rej,
  round(count(*) FILTER (WHERE "isAccepted")::numeric/nullif(count(*) FILTER (WHERE "isAccepted" OR "isRejected"),0),3) AS acceptance
FROM "recommendations"
WHERE "createdAt" >= '2026-07-01' AND "createdAt" < '2026-07-23'
GROUP BY 1 ORDER BY picks DESC;
```

For the rolling regression guard, swap the window for `"createdAt" >= now() - interval '14 days'` (same shape as `scripts/autoplay-telemetry.sql`).

## Revisit when

- Coverage drops below 60% over any rolling 14 days (guard against silent regression — query in Reproduction above).
- Per-source acceptance drops below 85% on a real basis → Phase D earns its place *for that source* (2026-06-24 gate); the `channelId` + time-bucket schema ADR comes first.
- A skip-reason UX redesign is proposed → new decision record.
