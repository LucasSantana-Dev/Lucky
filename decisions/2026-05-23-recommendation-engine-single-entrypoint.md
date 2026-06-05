# ADR: Collapse Recommendation Engine to a Single Public Entry Point

**Date:** 2026-05-23  
**Status:** Accepted

## Context

`packages/bot/src/services/musicRecommendation/index.ts` (214 LOC) exposes four public functions:

- `generateRecommendations()`
- `generateUserPreferenceRecommendations()`
- `generateHistoryBasedRecommendations()`
- `getContextualRecommendations()`

All four ultimately call the same internal `generateRecommendations()` scoring loop. The distinction between them is which input signals are populated — but callers cannot tell this from the function names alone. Additionally, internal helpers (`blendRecommendations`, `applySpanishLanguagePenalty`) are exported from `index.ts`, widening the public interface surface beyond its intended boundary.

A second problem: `RecommendationEngine` (the class) accepts a `config: Partial<RecommendationConfig>` in its constructor and exposes `updateConfig()` for runtime mutation. Because one engine instance is shared across all Guilds, concurrent replenish invocations can race on `updateConfig()` — a latent multi-tenancy bug.

These problems combine to make the Recommendation Engine's interface broader than its implementation. Callers face two questions that should not be their concern: (1) which function to call, and (2) whether config is stable.

## Decision

Collapse the public API to a single function:

```typescript
function recommendTracks(
    context: RecommendationContext,
): Promise<Recommendation[]>

interface RecommendationContext {
    guildId: string
    seedTracks: Track[]
    trackHistory: TrackHistoryEntry[]
    userPreferences: UserArtistPreference[]
    strategy: 'history' | 'preference' | 'contextual' | 'auto'
    limit: number
}
```

The `strategy` field carries what was previously encoded in the choice of function. `'auto'` (the default) lets the engine choose based on what signals are populated — the same fallback logic that currently lives in each of the four functions.

Un-export `blendRecommendations` and `applySpanishLanguagePenalty` — these are implementation details.

Make `RecommendationConfig` immutable at construction time: remove `updateConfig()`. Config is injected once at startup and never mutated. Per-Guild customisation (if needed) goes through `RecommendationContext`, not engine mutation.

## Alternatives Considered

**Keep four functions, just fix the export leak.** Rejected: the four-function API still forces callers to choose the right entry point. The caller (`replenisher.ts`) already constructs all the signals anyway — strategy selection inside the engine is strictly more informative.

**Strategy pattern (four classes, one interface).** Rejected: over-engineered. The scoring logic is shared across strategies; separate classes would duplicate the shared path. `RecommendationContext.strategy` achieves the same routing without the class hierarchy.

**Remove the Recommendation Engine and inline it in replenisher.** Rejected: the engine has a testable interface and value beyond the autoplay pipeline (e.g., the `/recommendations` dashboard endpoint calls it directly). Keeping it as an independent module is correct.

## Consequences

**Positive:**

- Callers have one call site; the interface is one type to understand.
- `blendRecommendations` and `applySpanishLanguagePenalty` become private — no external code can depend on them.
- Config immutability eliminates the `updateConfig()` race condition.
- Adding a new strategy is a new `strategy` enum value + case in the dispatch; no new public function.

**Negative:**

- `RecommendationContext` becomes a new type to maintain. If future strategies need signals not present today, `RecommendationContext` grows.
- Callers that currently call `generateHistoryBasedRecommendations()` explicitly (expressing intent) lose that explicitness — they must now set `strategy: 'history'`.

## Revisit When

- A new strategy requires context fields incompatible with `RecommendationContext` (split context types, or introduce strategy-specific context extensions).
- The engine is moved to `packages/shared` for use by the backend dashboard — at that point, reconsider whether `RecommendationContext` needs a port/adapter split for DB access.
