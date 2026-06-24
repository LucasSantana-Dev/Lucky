# ADR 2026-06-24 — Autoplay Phase-C baseline: defer the personalization / session-coherence layer (Phase D)

**Status:** Accepted
**Deciders:** Lucas Santana
**Extends / resolves:** `decisions/2026-05-21-autoplay-recommendation-roadmap.md` (the Phase-D gate this ADR was pre-committed to produce)
**Related:** `decisions/2026-06-01-recommendation-feedback-storage.md`, `decisions/2026-06-14-autoplay-mood-clustering-1095-hold.md`
**Trigger:** user request — "make the autoplay system a machine learning that learns from usage, scoped per server / user / channel / time." That request _is_ roadmap Phase D (and the roadmap's rejected "Pair B: persistent per-user/per-guild skip-learning", kept for post-Phase-C re-evaluation).

## Context

The 2026-05-21 roadmap sequenced autoplay as telemetry-first and made Phase D (a session-coherence / personalization layer) **conditional**, with an explicit pre-committed gate:

> "Ship Phase D **only if** the baseline acceptance-rate delta is large enough… If Phase C shows the layered defense already produces **>85% acceptance per source, Phase D becomes optional and gets deferred to a future ADR.**"

This ADR is that future ADR. The Phase-C baseline was pulled 2026-06-24 from **prod** (homelab `lucky-postgres`, table `recommendations`, since Phase-A telemetry landed 2026-05-22 — ~33 days).

### Baseline (prod)

Overall: **612** recommendations, range 2026-05-22 → 2026-06-24, **outcome coverage 35.9%** (220/612 have any accept/reject).

| Source          | 7-day accept% | Lifetime accept% | Lifetime acc / rej / pending  |
| --------------- | ------------- | ---------------- | ----------------------------- |
| SPOTIFY_REC     | 94.9          | 98.0             | 97 / 2 / 208                  |
| SEED_SIMILAR    | 94.1          | 96.9             | 93 / 3 / 129                  |
| LASTFM_LOVED    | 87.5          | 95.2             | 20 / 1 / 25                   |
| LASTFM_SIMILAR  | 100           | 100              | 4 / 0 / 12                    |
| ARTIST_FALLBACK | —             | —                | 0 / 0 / 18 (no outcomes ever) |

The gate condition (>85% per-source) **is met** — every source with outcomes reads 87.5–98%.

### The acceptance number is blind (load-bearing caveat)

It reads high because **rejections are essentially not recorded**: ~9 rejections total across all sources lifetime, 35.9% outcome coverage. This is a known, open bug — **#1275 "rejection telemetry never records — acceptance rate is blind."** So "94–98% acceptance" actually means "of the few outcomes written, almost all are accepts, because skips→`isRejected` aren't being captured." There is also **no `channelId` column** at all (confirmed) and no time-bucket — so two of the four dimensions the user asked to learn on aren't even recorded.

## Decision

**Defer Phase D — do not build the autoplay-ML / personalization (per-user×channel×time) layer now.** Two independent reasons, either sufficient:

1. **The gate is met.** Per-source acceptance is 87.5–98%, above the roadmap's >85% threshold. Per the roadmap's own pre-commitment, Phase D is deferred.
2. **There is nothing to learn from, and the signal is blind.** A learner that learns _what not to recommend_ per user/channel/time needs negative signal; there are ~9 rejections lifetime (#1275), 36% coverage, and no `channelId`/time columns. Building it now would be a demand-blind rebuild of a feature already measuring ~95% accept — exactly what the "measure demand before rebuilding" rule forbids.

Promote the roadmap ADR's status to **"Roadmap completed at Phase C; coherence/personalization layer deferred."**

### Prerequisite path (if Phase D is ever revisited)

The learner is not the next step — **fixing the signal is.** In order: (1) fix #1275 — wire skip→`isRejected` at the discord-player skip boundary so rejections record; (2) raise outcome coverage well above 36%; (3) add `channelId` + a coarse time bucket to `recommendations`. Then re-measure. **Only if** per-source acceptance then falls below 85% on a real (non-blind) basis does Phase D earn its place — for that source, behind a guild flag, A/B'd, augmenting (not replacing) the 60-day-proven veto stack.

## Alternatives considered

- **Build the per-user×channel×time learner now (the literal request).** Rejected: gate met; acceptance blind (#1275); ~9 rejections = no training signal; `channelId`/time not captured. It would train on noise and "improve" a 95%-accept system.
- **Defer the learner + fix the signal first, then re-measure (chosen prerequisite path).** Targets the real gap (#1275 + coverage + missing dims) instead of layering ML on blind data.
- **Defer the learner and do nothing about the signal.** Rejected: leaves the baseline permanently blind — the gate could never be re-evaluated honestly, and #1275 would keep masking real rejections.

## Consequences

**Positive:** no speculative rebuild; effort routes to the actual defect (#1275) that makes the metric trustworthy; the layered drift-veto stack (60 days of production fixes) stays intact and untouched.

**Negative:** the "ML autoplay" the user envisioned is deferred indefinitely; the channel + time dimensions remain unrecorded until the prerequisite work lands. If acceptance is _secretly_ lower than the blind 95% (because skips aren't counted), we won't know until #1275 is fixed — which is precisely why #1275 is now the priority, not the learner.

**Neutral:** no user-facing autoplay change. The veto stack continues to serve.

## Revisit when

- **#1275 is fixed and outcome coverage exceeds ~70%**, AND a re-measured per-source acceptance **drops below 85%** on a real basis → build Phase D for that source (flagged, A/B'd, augmenting the vetoes).
- **A new geographic/genre drift class** the veto stack can't absorb appears → a coherence penalty may be warranted ahead of the acceptance gate.
- **The operator explicitly accepts the cost** of building the learner speculatively despite the data — their call to override; this ADR records that the data does not justify it today.
