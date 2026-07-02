# ADR 2026-07-01 — Autoplay: deploy-first + 21-day measurement window + release-cadence guard

**Status:** Accepted
**Deciders:** Lucas Santana
**Extends:** `decisions/2026-06-24-autoplay-phase-c-baseline-defer-coherence-layer.md` (prerequisite path: fix signal → coverage >70% → re-measure)
**Related issues:** #1645 (stranded release), #1646 (skipReason dead), #1580 (tautological eval), #1589 (over-queueing fix, merged undeployed), #1636 (extractor beta pin)
**Trigger:** repeated fix-attempt loop on autoplay/song features without visible improvement.

## Context

Prod runs v2.25.0 (tagged 2026-06-24). 26 commits stranded on main, including `815d7633` (#1589) — the over-queueing + eviction-terminal-events fix that the 2026-06-24 ADR's prerequisite path depends on. Prod telemetry verified 2026-07-01:

- Outcome coverage since 06-26: **22.5%** (vs 35.9% lifetime baseline). Eviction terminal events: 0. `feedback`: 0 rows.
- Daily coverage is volatile (0–96.6%), not monotonically declining; **high-generation days have the worst coverage** (06-23: 150 recs / 27.3%; 06-29: 99 / 11.1%) — the over-queueing signature #1589 targets.
- `skipReason`: **0 rows lifetime** since feature shipped (#1377, 2026-06-13). Pipeline code exists end-to-end (`trackNowPlaying.ts` emoji prefill → `reactionHandler.ts` → `recordRecommendationSkipReason`); prefill failure is silently swallowed (`message.react(emoji).catch(() => {})`), so a permissions failure would be invisible (#1646).
- Rejection telemetry (post-#1275) works: 13 rejections/14d.
- Event rate ≈ 40–110 recs/day. Critic math: reaching a trustworthy ≥70% coverage read needs ~3 weeks of events, not 7 days.
- Release cadence collapsed: 8 releases 06-21→06-24, then 7 days of nothing. Root cause of the fix-loop: fixes merge but never deploy, so every diagnosis ran against stale prod behavior.
- Deploy risk audit: stranded range contains 3 Prisma migrations + `schema.prisma` changes (batch-jobs et al.) and package.json bumps → deploy must include `prisma migrate deploy` and post-deploy verification.
- `autoplayEval` is not wired into any CI workflow — #1580's tautological fixture gates nothing today (fixing it is measurement hygiene, not a deploy blocker).

## Decision

**Deploy first; freeze recommendation-quality code for a 21-day measurement window; add a release-cadence guard so stranding cannot silently recur.**

1. **Cut v2.26.0 from main and deploy to prod** (with `prisma migrate deploy`; verify bot version + migrations + a smoke autoplay session post-deploy).
2. **21-day measurement window** (not 7 — event rate makes a 7-day read statistically useless). During the window:
    - **Allowed:** telemetry/signal fixes that don't change what gets recommended — diagnose #1646 (first probe: does the bot have ADD_REACTIONS / do prefilled emojis appear on now-playing embeds in prod?); fix if code/permission bug; log the silent `.catch`. Test/CI debt (#1580, #1632, #1635). Unrelated non-music work.
    - **Frozen:** scorer weights, new signals, candidate-source changes, mood clustering (#1095), Phase-D anything, and the #1636 extractor swap — _unless playback itself breaks, in which case reliability overrides the freeze (hotfix path)_.
3. **Release-cadence guard (the process fix):** a scheduled weekly GitHub Actions check that opens/updates an issue when `main` is >10 commits ahead of the latest tag. Budget ≤ half a day; if it creeps, ship the dumbest version (cron + `gh issue create`).
4. **At window end (≈2026-07-22): re-measure** against the 2026-06-24 ADR gate — aggregate outcome coverage (target >70%) and per-source acceptance. Route next work from that read: coverage recovered + acceptance ≥85% → autoplay is at the "good point"; work shifts to reliability (#1636) and UX. Coverage still low → the over-queueing diagnosis was wrong; escalate to a tracer investigation of the rec lifecycle before any further fixes.

## Alternatives considered

- **Deploy + fix all known debt in parallel (#1646/#1580/#1636/#1632), ship v2.27.0 at window end.** Rejected: bundles four changes into one measurement window → noisy attribution; #1636 (extractor swap) is a product-behavior change that contaminates the read; violates the measure-before-building rule.
- **Code-first, batch deploy later.** Rejected: recreates the exact loop this ADR exists to break, and contradicts the 2026-06-24 ADR's prerequisite path.
- **Deploy-first with 7-day window.** Rejected on critic review: at ~40–110 events/day with ~22–36% coverage, 7 days cannot distinguish fix-worked from sampling noise.
- **Deploy only, no process fix.** Rejected: stranding was a silent failure — nothing today alerts when main drifts ahead of the last tag; without a guard the same collapse repeats.

## Consequences

**Positive:** every already-written fix finally reaches prod; the next diagnosis runs against current code; measurement window is long enough to be conclusive; cadence guard converts a silent failure mode into a visible one.

**Negative:** recommendation-quality improvements wait ~3 weeks; if #1646 turns out to be zero user adoption (not a bug), the skip-reason signal stays empty through the window and a different feedback UX has to be designed later.

**Neutral:** #1580/#1632/#1635 proceed freely — they don't touch prod behavior.

## Revisit when

- **Window ends (≈2026-07-22):** re-measure; route per Decision §4.
- **Playback breaks during the window** (youtubei beta extractor, #1636) → reliability hotfix overrides the freeze.
- **#1646 diagnosis = zero adoption** (reactions render but nobody clicks) → skip-reason signal needs a UX redesign, not a fix; record in a follow-up decision.
- **Coverage still <40% two weeks post-deploy** despite #1589 live → over-queueing wasn't the root cause; stop and trace the recommendation lifecycle end-to-end before writing any new fix.
