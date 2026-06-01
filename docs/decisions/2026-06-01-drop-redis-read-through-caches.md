---
status: accepted
date: 2026-06-01
refines: 2026-05-31-redis-scope-reduction
revisit_after: when a revisit trigger below fires
---

# Drop the Redis read-through caches over Postgres (moderation, custom commands, role access)

## Status

Accepted. Refines [[2026-05-31-redis-scope-reduction]]; parallels
[[2026-05-31-guild-settings-postgres-source-of-truth]]. Decided via research + Opus
`critic` (critic did not flip the leader; it sharpened the rollout by call-frequency).

## Context

Three shared services — `moderationSettings`, `CustomCommandService`,
`GuildRoleAccessService` — share one pattern: **Postgres is already the source of
truth**; Redis is only a **read-through cache** (300s TTL) with write-invalidation
(`redisClient.del` on update), all guarded by `redisClient.isHealthy()` so they already
fall through to Postgres when Redis is down. So unlike GuildSettings (which was a real
Redis-SoT split-brain), here Redis carries **no unique data** — pure optional cache.

Cross-process: the backend (web UI) writes these; the bot reads them. Today a web-UI
change is visible to the bot only on the next cache-miss (≤300s) — i.e. the cache _adds_
staleness.

Critic finding: the three are NOT one heat class. `CustomCommandService.listCommands()`
runs **per message** (message-handler hot path) — but it already has **no cache** (direct
table scan today). `getCommand()` is the cached one. `moderationSettings` +
`GuildRoleAccessService` are **off-path** (guild-automation capture/apply only, not
per-message).

## Decision

**Drop the Redis cache from all three; read Postgres directly.** Single-instance +
co-located Postgres → a direct read per call is cheap and **always fresh**, and removing
the cache _removes_ the cross-process staleness rather than adding it. Postgres errors
fail fast (callers already have try/catch — confirmed at the custom-command handler).

Roll out as two slices by risk:

1. **Moderation + RBAC** (off-path, zero per-message heat) — drop cache, trivial.
2. **Custom commands** (`getCommand` cached, `listCommands` already uncached + per-message)
   — drop the `getCommand` cache; `listCommands` is unchanged. Acknowledge the per-message
   Postgres read; revisit only if measured slow.

## Alternatives considered

- **A — keep the Redis caches.** Rejected: undercuts the pub/sub-only goal, and the cache
  only _adds_ cross-process staleness here (Postgres is already SoT + co-located).
- **C — in-memory (per-process) cache.** Rejected: bot wouldn't see backend web-UI writes
  (per-process staleness, no shared invalidation) — strictly worse than direct read for the
  backend-writes/bot-reads split. Reconsider only if a per-message read is measured hot.
- **D — drop + Redis pub/sub invalidation.** Rejected: overkill; keeps Redis.

## Consequences

Positive: ~3 fewer Redis consumers (advances pub/sub-only); web-UI writes instantly fresh
to the bot; fail-fast beats retry-on-flaky-Redis. No backfill (Redis held no unique data).
Bonus: `CustomCommandService.incrementUsage()` had a latent cache-staleness bug (updated
Postgres, not the cached copy) — dropping the cache fixes it.

Negative / accept: a Postgres read per call, incl. `getCommand` on command use. Acceptable
single-instance/co-located; measure if it ever feels slow. Keep `upsertCommand`'s
`pg_advisory_xact_lock` — it's for transaction isolation, NOT cache coherence; survives the drop.

## Revisit when

- Custom-command per-message Postgres read latency becomes measurable (>~10ms) → add an
  in-process LRU for `getCommand`/`listCommands` (process-local, no cross-process concern).
- Bot goes multi-instance → in-memory caches break; re-evaluate shared cache / invalidation.
- Postgres latency shows on guild-automation capture → cache or preload, decide then.
