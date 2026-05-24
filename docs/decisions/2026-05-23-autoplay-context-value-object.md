# ADR: Introduce AutoplayContext Value Object in the Autoplay Pipeline

**Date:** 2026-05-23  
**Status:** Accepted

## Context

The Autoplay pipeline (`packages/bot/src/utils/music/autoplay/`) totals ~10,000 LOC across 37 files. The central orchestrator, `replenisher.ts` (637 LOC), calls each Candidate Source collector with 15+ positional arguments. Two symptoms make this painful:

1. **Calling convention brittleness.** `collectRecommendationCandidates` takes 20 positional arguments including `autoplayMode`, `artistFrequency`, `implicitDislikeKeys`, `implicitLikeKeys`, `sessionMood`, `currentFeatures`, `genreContext`, and `blockSertanejo`. Adding any new signal (e.g. "user's blocked genres") requires updating every collector signature, the replenisher call site, and every test that constructs arguments.

2. **Module-level mutable caches.** `sessionMoodCache` and `replenishLocks` live as module-level `Map` instances. They are invisible to callers, survive across test runs without explicit reset, and make test isolation impossible without mocking the entire module.

Both issues prevent unit-testing Candidate Sources in isolation: each collector test must either spin up a real `GuildQueue` (Discord Player dependency) or construct 15+ correct mock arguments.

The vocabulary from `CONTEXT.md` defines **Autoplay**, **Candidate**, **Candidate Source**, and **Replenisher** — the value object codifies what state a replenish needs in terms the domain already names.

## Decision

Introduce an `AutoplayContext` value object that bundles all per-replenish session state:

```typescript
interface AutoplayContext {
    readonly guildId: string
    readonly seedTracks: Track[]
    readonly excludedUrls: Set<string>
    readonly excludedKeys: Set<string>
    readonly trackHistory: TrackHistoryEntry[]
    readonly sessionMood: SessionMood
    readonly audioFeatures: SpotifyAudioFeatures | null
    readonly genreContext: GenreContext | null
    readonly artistFrequency: Map<string, number>
    readonly dislikedWeights: Map<string, number>
    readonly likedWeights: Map<string, number>
    readonly preferredArtistKeys: Set<string>
    readonly blockedArtistKeys: Set<string>
    readonly implicitDislikeKeys: Set<string>
    readonly implicitLikeKeys: Set<string>
    readonly autoplayMode: AutoplayMode
    readonly blockSertanejo: boolean
    readonly replenishCount: number
    readonly currentTrack: Track | null
    readonly recentArtists: string[]
}
```

Each Candidate Source collector changes from 15+ positional arguments to `(context: AutoplayContext)`. The Replenisher builds one `AutoplayContext` at the start of each replenish invocation and passes it through. Module-level caches are moved inside the `AutoplayContext` builder (constructed fresh per invocation) — the caches are not part of the value object itself but of the `AutoplayContextBuilder` that reads from stable per-guild state.

## Alternatives Considered

**Keep as-is.** Rejected: the argument-count problem compounds with each new signal. The Phase D roadmap (ADR `2026-05-21-autoplay-recommendation-roadmap.md`) adds at least two new context fields; adding them to 15+ function signatures is unacceptable.

**Pass a plain `Record<string, unknown>` bag.** Rejected: loses type safety, making it harder to detect when a Candidate Source requires a new field.

**Move replenish state to a class instance.** Rejected: mutable class instances have the same test-isolation problems as module-level caches. An immutable value object per invocation is preferable.

## Consequences

**Positive:**

- Each Candidate Source's test becomes: "given this `AutoplayContext`, what Candidates come back?" — a pure function test.
- Adding a new context field is one change to `AutoplayContext`; all callers get a type error if they fail to supply it.
- Module-level cache state is no longer implicit; it lives in the builder and can be tested/reset independently.

**Negative:**

- Non-trivial migration: 37 files, ~10k LOC. Collector signatures change across the board. High risk of regressions in the replenish path.
- `AutoplayContext` must be kept up to date as new Candidate Sources are added; the single type becomes a choke point for context evolution.

## Revisit When

- The Phase D autoplay roadmap adds new Candidate Sources that need context fields not currently in `AutoplayContext`.
- The Autoplay pipeline is split across multiple workers/processes (would require serialisable context).
