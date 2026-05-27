---
status: deferred
date: 2026-05-24
revisit_after: after-guild-automation-decommission
---

# CandidateAggregator seam on the Replenisher is deferred

During an architecture review (`/improve-codebase-architecture`) of `packages/bot/src/utils/music/autoplay/replenisher.ts` (609 LOC), introducing a `CandidateAggregator` interface behind the 4 candidate sources was proposed as a deepening opportunity. The proposal was evaluated and deferred.

## Context

`replenisher.ts` imports 12+ sibling modules and wires together 4 candidate sources (similar-artist lookup, popular-in-genre, listening-history seed, discovery). The initial proposal was to introduce a `collect(context: AutoplayContext): Promise<Candidate[]>` interface, extract each source as an `Aggregator` implementation, and inject them via constructor or function parameter so each source could be tested and swapped independently.

## Decision

**Defer.** Do not introduce `CandidateAggregator` until Guild Automation executor extraction is complete.

Three blocking issues were identified:

1. **Test-mock benefit is false.** `AutoplayContext` has 15+ fields (`queue`, `excludedUrls`, `excludedKeys`, `dislikedWeights`, `likedWeights`, `preferredArtistKeys`, `blockedArtistKeys`, `currentTrack`, `recentArtists`, `autoplayMode`, `artistFrequency`, `implicitDislikeKeys`, `implicitLikeKeys`, `sessionMood`, `genreContext`). Mocking cost does not decrease — it redistributes from one spec file to N aggregator spec files. The original claim that "mock count drops from 9×18 to ≤4 aggregator stubs" is wrong.

2. **Injection breaks the singleton architecture.** Lucky bot uses module-level singleton service instances. Injecting aggregator instances via function parameter or constructor would require either (a) factory functions that accept aggregator lists at call time — unusual in this codebase — or (b) a class constructor, which would create a new instance pattern inconsistent with everything else in `packages/bot/src/services/`. Neither fits.

3. **Production-path initialization risk.** Replenisher sits on the hot path of every autoplay cycle. Changing its initialization pattern before the Guild Automation work (which is already touching shared service wiring) risks introducing subtle initialization-order bugs at the intersection of two large concurrent changes.

## Considered options

- **A. Introduce CandidateAggregator with function-parameter injection.** Rejected: breaks singleton pattern, test benefit claim is false.
- **B. Introduce CandidateAggregator with class constructor injection.** Rejected: introduces a new instance-creation pattern inconsistent with the rest of the service layer.
- **C. Leave replenisher.ts as-is (deferred).** Accepted: no behavior change, no risk, revisit after Guild Automation decommission when the service wiring picture is clearer.

## Consequences

- `replenisher.ts` remains a 609-LOC flat orchestrator. Its 12+ imports are a sign of shallow module decomposition but not actively causing delivery friction today.
- If a new candidate source is added, the developer adds one import and one call in `replenisher.ts` — straightforward and consistent with the existing pattern.
- The `AutoplayContext` value object (ADR `docs/decisions/2026-05-23-autoplay-context-value-object.md`) and the `recommendTracks()` single entrypoint (ADR `docs/decisions/2026-05-23-recommendation-engine-single-entrypoint.md`) already reduced the surface area that a future CandidateAggregator seam would need to cross.

## Revisit when

- Guild Automation Module Executor extraction is complete and `GuildAutomationExecutionService.ts` is decommissioned — the service wiring patterns will be clearer then.
- A third candidate source is added and the `replenisher.ts` import list grows beyond ~15 modules — that signals real locality breakdown.
- AutoplayContext builder pattern is implemented (see `2026-05-23-autoplay-context-value-object.md`) — if building context remains expensive, the aggregator boundary may become worthwhile to cache at.
- The test-mock claim is revisited and a concrete test-reduction number is demonstrated rather than asserted.

## Cross-references

- `docs/decisions/2026-05-23-autoplay-context-value-object.md` — AutoplayContext VO (type in place, builder pending).
- `docs/decisions/2026-05-23-recommendation-engine-single-entrypoint.md` — `recommendTracks()` single entrypoint (implemented).
- `docs/decisions/2026-05-19-guild-automation-module-executors.md` — Guild Automation executor extraction (prerequisite for revisiting this ADR).
- This decision was produced via `/improve-codebase-architecture` + `/research-and-decide` (2026-05-24 session). The critic assessment explicitly flipped the test-mock benefit claim.
