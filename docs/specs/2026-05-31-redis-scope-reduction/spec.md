---
status: active
created: 2026-05-31
owner: lucassantana
pr: https://github.com/LucasSantana-Dev/Lucky/issues/1111
tags: redis,postgres,refactor,infra
---

# redis-scope-reduction

## Goal

Reduce Redis to a single responsibility. Today ~20 modules use Redis for KV/cache; only one — the `MusicControlService` bot↔backend pub/sub (`music:command|result|state`) — genuinely needs it. Move everything else to Postgres (persistent) or in-memory (ephemeral) so Redis becomes a small, pub/sub-only dependency.

## Approach

Per ADR `docs/decisions/2026-05-31-redis-scope-reduction.md` (decided via research + critic; critic flipped the original "drop Redis entirely" — the music pub/sub is load-bearing IPC for the web music surface). Decouple Redis's two roles:

- **Persistent stores → Postgres/Prisma** (durable across restart).
- **Ephemeral caches → in-memory** (`Map` + TTL; reset-on-restart acceptable).
- **Retain a minimal Redis only for the music pub/sub.**

Incremental, one store per PR, each: new/reused Prisma model + migration + preserve service interface + mock-prisma spec + verify tsc/tests. No big-bang.

## Status

Shipped (merged to main):

- TrackHistory → Postgres (#1112)
- NamedQueue → Postgres (#1113)
- MusicSessionSnapshot → Postgres (#1114)
- GuildCounter → Postgres + dead-duplicate deletion + rate-limit→in-memory (#1115)
- ProviderHealth → in-memory (#1116)

Remaining:

- AutoMod spam-window → in-memory (breaks ~6 Redis-coupled backend tests; needs a test-reset seam)
- GuildSettings settings → Postgres (latent bug: guild config on a 7-day Redis TTL silently resets)
- Watchdog `.keys('music:session:*')` → indexed Postgres query
- Bot startup hard-throw on Redis-unavailable → pub/sub-only
- Drop the orphaned `GuildSession` model (superseded by `MusicSessionSnapshot`)

## Out of scope

- Removing Redis entirely / re-architecting the music pub/sub (Postgres `LISTEN/NOTIFY` or WebSocket) — ADR Option B, deferred as its own gated decision.
- Backend HTTP session store (`connect-redis`) — already has a file/memory fallback.

## Revisit when

- Bot goes multi-instance → in-memory caches break; a shared store is needed again.
- Postgres write latency on former-Redis hot paths becomes measurable.
