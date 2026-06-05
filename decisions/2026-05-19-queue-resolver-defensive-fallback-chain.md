---
status: accepted
date: 2026-05-19
revisit_after: 2026-06-02
---

# Queue resolver keeps its 6-path defensive fallback chain (for now)

`packages/bot/src/utils/music/queueResolver.ts` exposes `resolveGuildQueue(client, guildId)` — the single chokepoint (enforced by a guardrail test) for fetching a discord-player `GuildQueue` from a guild ID. It tries six paths in order: `nodes.get → queues.get → nodes.resolve → nodes.cache.get → cache scan by queue.id → cache scan by metadata.guild.id`. 34 production call sites and 257 LOC of tests depend on this shape.

We are **keeping all six paths** pending production telemetry. We will revisit on **2026-06-02** with 14 days of source-distribution data; if the top three paths cover >99% of calls, we prune. Otherwise we leave the chain intact.

## Considered options

- **A — Status quo (accepted).** Keep all 6 paths and the guardrail. Cost: ~25–30h/year of upgrade-friction on every discord-player bump. Defensible because each path landed in response to a real production incident (PR #167, PR #364).
- **B — Prune to top 3** (`nodes.get → queues.get → cache scan by guild`). **Deferred.** Plausibly correct but requires production data to confirm `nodes.resolve` + `nodes.cache.get` + `cache scan by id` are dead. Pruning speculatively risks reintroducing #364's regression.
- **C — Adapter layer (`PlayerPort` interface).** Rejected. The resolver is already the adapter; adding another layer over a single-target bot is indirection without payback.
- **D — Wait for upstream fix in discord-player.** Rejected. Months-out timeline; zero current value.
- **E — Cache-scan-only.** Rejected. Loses the fast paths; degrades on large caches.

## Decision

Stay on **Option A**, **and** ship observability + gap-fixes immediately so the next decision can be data-driven:

1. **Instrument** every `resolveGuildQueue` call with a `queue_resolution_source` tag (Sentry/Langfuse) carrying the resolved `source` value or `miss`.
2. **Expand the guardrail test** (`queueResolver.guard.spec.ts`) so its `TARGET_DIRECTORIES` covers `src/functions/music/autoplay` and `src/services/musicRecommendation`, not just slash commands and webMusic.
3. **Reorder cache scans**: prefer `metadata.guild.id` match (current path 6) over `queue.id` match (current path 5). Guild membership is more authoritative than a numeric queue identifier; the current order is a multi-guild correctness foot-gun in corrupted-cache scenarios.
4. **Document `nodes.resolve` semantics** with a one-line comment grounded in the discord-player v7.2 changelog (lazy-init vs. redundant-with-`get`).
5. **Add a CI canary** that re-runs `queueResolver.spec.ts` against the pinned discord-player version on every PR, failing on any semver-major bump until the resolver is re-verified against the new API.

## Consequences

**Positive:**

- The next revisit (2026-06-02) is data-driven, not opinion-driven.
- The guardrail expansion closes a real gap (autoplay and recommendation paths can currently bypass the resolver).
- The reordered cache scans remove a latent multi-guild correctness risk.
- The canary catches discord-player API drift before production.

**Negative:**

- Six paths and 257 LOC of tests remain on the maintenance ledger for at least 14 more days.
- The instrumentation adds one tag per `resolveGuildQueue` call (~34 sites × call frequency); negligible Sentry/Langfuse volume impact for a bot of Lucky's scale.

**Neutral:**

- No change to public API; no change to call-site contracts.

## Revisit when

- **2026-06-02** with 14 days of telemetry — primary trigger.
- discord-player v8 ships or v7.x announces a breaking change to `GuildNodeManager`.
- A new `resolveGuildQueue`-related incident lands in production (would validate the fallback chain's value and push the revisit out).
- Production data shows any single path accounting for >99% of resolutions (would justify aggressive pruning to that one).
- The guardrail test fires on a real PR (would prove the expanded `TARGET_DIRECTORIES` is doing its job).

## Cross-references

- PR #167 (2026-03-11) — created the resolver and the original 5-path chain.
- PR #364 (2026-03-25) — added path 6 (`metadata.guild.id` scan).
- `CONTEXT.md` — see the **Player** glossary entry; `resolveGuildQueue` is the canonical access path from `guildId` to in-memory Player.
- Critic review (2026-05-19, this session) — surfaced the observability gap, guardrail-coverage gap, scan-ordering risk, and canary-CI opportunity. Without that critique this would have been a less rigorous "leave it alone" non-decision.
