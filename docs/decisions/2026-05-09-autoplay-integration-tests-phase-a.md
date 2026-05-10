# ADR — Autoplay integration-test rewrite: commit to Phase A only

- **Date:** 2026-05-09
- **Status:** Accepted
- **Owner:** Lucas Santana
- **Related:**
  `docs/decisions/2026-05-09-bot-test-suite-cleanup-strategy.md`
  `docs/decisions/2026-05-09-branch-strategy-no-stacking.md`
  `.agents/plans/autoplay-integration-rewrite.md`

## Context

Phase-2 of the bot test cleanup brought the suite from 2848 → 2825 tests
across three stacked PRs (#836 + batch 2 + batch 3, all gate-checked at
67/63/64/68). The cumulative LOC reduction was ≈ 1432, but the **test count
remains 1.9× over the polyglot-bot proportionality ceiling of 1500** set in
the cleanup-strategy ADR.

The full path to ≤ 1500 is the autoplay integration-test rewrite drafted at
`.agents/plans/autoplay-integration-rewrite.md` — 4 phases (A: harness, B:
replenishQueue cluster, C: scorer/selector/collector, D: Stryker validation),
~6 sessions of work.

Three forces argue against committing to all 4 phases now:
1. v2.10.0 isn't blocked on test count. Suite runtime is 22s; gate is stable.
2. 6 sessions of test-suite refactor displace feature work in the 2.10.x cycle.
3. Half-done harness work is a known failure mode (sunk cost if v2.11.0
   features pull priority).

Three forces argue against deferring entirely:
1. Phase A's harness (`__fixtures__/` + smoke test for PR-#821 sertanejo
   filter) is the **highest-leverage artifact**. It unlocks all later cleanup
   AND any new autoplay refactor PR.
2. Building the harness while context is fresh is cheaper than rebuilding it
   in 2 months.
3. Skipping it leaves the cleanup-strategy ADR open-ended ("integration
   rewrite TBD") indefinitely.

## Decision

**Execute Phase A only as a single PR. Defer Phase B, C, D. Re-evaluate
after Phase A lands and one autoplay-touching PR has used the harness in
anger.**

Phase A scope (from `.agents/plans/autoplay-integration-rewrite.md`):

1. `packages/bot/src/utils/music/autoplay/__fixtures__/`
   - `mockSpotifyApi.ts` — fetch boundary, deterministic responses
   - `mockLastFmApi.ts` — fetch boundary
   - `mockYouTubeExtractor.ts` — metadata + stream extraction
   - `mockDiscordContext.ts` — minimal Channel/Guild/VoiceState
   - `buildAutoplayPipeline.ts` — wires real `replenishQueue` with mocked
     network boundaries; returns the run function + state probe

2. **One** integration smoke test exercising the PR-#821 sertanejo/funk
   filter scenario: Brazilian-portuguese seed flows through the pipeline,
   asserts Spanish gospel results are excluded.

3. No deletion of existing unit tests in this PR.

## Consequences

**Positive:**
- Smallest reversible step toward the ≤ 1500 target.
- The harness is reusable for any autoplay refactor PR — even if Phase B/C
  never run formally, the next bug-fix or feature in autoplay benefits.
- The smoke test re-validates PR-#821's regression fix at the integration
  level (currently only unit-tested across multiple shallow specs).
- Zero blast radius if rolled back — no source changes, no existing test
  deletions, additive only.
- Fits the "no stacking" rule (ADR `2026-05-09-branch-strategy-no-stacking`):
  one PR after the current cascade drains.

**Negative:**
- Test count unchanged after this PR (Phase A is infrastructure).
- The 2825 → 1500 gap stays open; we're committing only to the first
  ~⅙ of the journey.
- Risk of harness drift if Phase B is deferred too long — a harness without
  callers rots.

**Neutral:**
- Plan document `.agents/plans/autoplay-integration-rewrite.md` stays as-is;
  this ADR scopes which phase actually fires.

## Alternatives considered

- **Full plan execution (A+B+C+D, ~6 sessions).** Rejected: no forcing
  function. v2.10.0 doesn't need ≤ 1500 to ship; suite is functional. Risk
  of half-done work if v2.11.0 priorities shift.
- **Defer indefinitely.** Rejected: loses the cheap-now-expensive-later
  trade on the harness. Leaves the cleanup-strategy ADR open-ended.
- **Lower the coverage gate further (55/50/50/55) to enable raw deletion.**
  Rejected: weakens actual safety. The gate is the policy artifact; lowering
  it to chase a count target inverts cause and effect.
- **Contract / snapshot tests at module boundaries.** Rejected: lower
  fidelity than integration tests for autoplay flows; doesn't capture
  cross-cutting concerns like locale veto + dedup interactions.
- **Slim plan = Phase A+B (3 sessions).** Rejected as a single commitment:
  bundles Phase B's risk into the same decision. Phase B is a separate go/no-go
  worth deciding *after* the harness exists and we know what it costs to write
  one integration test.
- **Property-based tests via fast-check.** Rejected as the primary path:
  niche fit (parseArtists, scorer); doesn't address integration concerns.
  Could complement Phase B later; not a substitute.
- **Accept higher target, re-baseline ADR to ~2500.** Rejected: dilutes the
  proportionality argument and makes future cleanup harder to justify.

## Revisit when

Re-open and decide on Phase B execution **when** all of these are true:

1. Phase A's PR has merged.
2. At least one new autoplay-touching PR (bug fix, feature, refactor) has
   landed using the harness in its tests. Concrete evidence the harness is
   adopted, not theoretical.
3. The next autoplay-related cleanup batch has been scoped with a one-page
   plan (which clusters, expected test reduction, integration test count).

If condition (2) fails to materialize within 4 weeks of Phase A merging, the
harness is speculative and should be either documented as such or removed
during a future hygiene pass.

If a new autoplay regression is reported and the harness genuinely helps
debug it, Phase B may be promoted ahead of schedule.

## References

- Plan: `.agents/plans/autoplay-integration-rewrite.md` (full 4-phase plan;
  this ADR scopes phase A only).
- Worked example for harness scope: PR-#821 sertanejo/funk filter regression
  (`project_lastfm_scrobble_pr821.md` memory note).
- Branch policy: ADR `2026-05-09-branch-strategy-no-stacking.md`.
