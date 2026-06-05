---
status: accepted
date: 2026-05-31
revisit_after: 2026-11-30
---

# Redis scope reduction: migrate KV/cache to Postgres + in-memory, retain Redis only for the bot↔backend music pub/sub

## Status

Accepted. Triggered by the operator's question — "do we actually need Redis for a single-operator
hobby bot?" — during an architecture/overengineering review. A read-only usage sweep + an Opus
`critic` pass were run before deciding. The critic **flipped** the initial framing ("drop Redis
entirely"), and the decision below reflects the revised, evidence-backed scope.

## Context

Lucky is a single-operator, single-instance Discord music bot (`packages: bot, backend, frontend,
shared`). `ioredis` lives only in `@lucky/shared`; ~22 modules consume Redis across bot/backend/shared.

Verified usage (commands, occurrences): `.keys` ×154, `.subscribe` ×35, `.publish` ×7, `.setex` ×32,
`.get` ×22, `.del` ×14, `.pipeline` ×13, `.ttl`/`.expire` ×8; sets and lists; plus distributed-lock
primitives `setNxPx` + `delIfValueMatches` (`packages/shared/src/services/redis/client.ts:155-195`).

Two distinct services hide behind "Redis":

1. **KV / cache** — the bulk. Persistent stores (named saved queues, track history, autoplay
   counters, music session-restore snapshots) and ephemeral TTL caches (provider-health, AutoMod
   spam windows, settings caches). Backend HTTP sessions already fall back to file/memory
   (`packages/backend/src/middleware/session.ts`).
2. **Pub/Sub** — the **only** non-cacheable, load-bearing use. A single service,
   `packages/shared/src/services/music/MusicControlService.ts`, uses channels `music:command` /
   `music:result` / `music:state` as the **bot↔backend IPC bridge**. This powers the
   web music-control surface added in `bb40e9c6` — a current feature.

The bot throws on Redis-unavailable at startup unless `skipRedis:true`; individual ops degrade.
Infra: a `redis:8-alpine` container (256MB prod / 128MB dev). The `setNxPx`/`delIfValueMatches`
locks are **defined but not currently called** (critic-verified) — not a migration factor.

## Options

| Option                                                                    | Verdict        | Why                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A — Decouple: KV→Postgres + in-memory, keep minimal Redis for pub/sub** | **CHOSEN**     | Removes Redis from ~20 KV consumers (Postgres already runs; it becomes the single persistence SoT). Ephemeral TTL caches go in-memory (reset-on-restart is acceptable for caches). The one IPC bridge stays on a tiny Redis — nothing breaks. ~90% of the simplification, no feature regression.                                                                                                                                       |
| **B — Full zero-Redis (re-architect pub/sub too)**                        | Rejected (now) | Eliminating the container entirely requires replacing the music IPC (Postgres `LISTEN/NOTIFY` or a WebSocket). The critic flagged this as the fatal gap in "drop entirely": `LISTEN/NOTIFY` adds payload/timeout/connection semantics and is fragile if the app ever goes multi-instance; a WebSocket is new transport code. Risks the just-built web music feature for marginal extra benefit. Deferred to a separate gated decision. |
| **C — Keep Redis as-is (status quo)**                                     | Rejected       | Stable, but leaves ~20 KV consumers + a 256MB container doing work Postgres + in-memory already cover. Doesn't answer the operator's simplification intent.                                                                                                                                                                                                                                                                            |

Critic (Opus) verdict on the original "drop Redis entirely": **REJECT → REVISE** — KV→Postgres is
sound; removing Redis _entirely_ is not, until pub/sub is re-architected. Option A is that revision.

## Decision

**Decouple Redis's two roles.** Specifically:

1. **Persistent stores → Postgres/Prisma**: named saved queues, track history, autoplay/repeat
   counters, music session-restore snapshots. These gain durability across restarts via the DB
   that already exists.
2. **Ephemeral TTL caches → in-memory**: provider-health, AutoMod spam windows, short-lived
   settings caches. Loss-on-restart is acceptable (they are caches).
3. **Retain a minimal Redis ONLY for `MusicControlService` pub/sub** (`music:command|result|state`).
   Removing it is out of scope here (Option B, deferred).
4. **No big-bang.** Per the CLAUDE.md no-big-bang-rewrite gate, this is multi-PR, one store at a
   time, behind a **Phase-0 prototype**: migrate **`TrackHistory`** first (self-contained list +
   TTL — the smallest representative store) to validate the Postgres TTL + indexing pattern before
   committing the rest.

## Consequences

Positive:

- ~20 KV consumers leave Redis; Postgres becomes the single persistence source of truth.
- Ephemeral caches simplify to in-memory maps with TTL.
- Smaller infra surface (Redis becomes a tiny pub/sub-only dependency) and one fewer dependency for most of the codebase.

Negative / to-handle in implementation:

- **TTL/expiry** has no native Postgres equivalent → each persistent store needs an explicit
  strategy: lazy-delete-on-read (cheap, fine for point reads) or a periodic sweep job (needed for
  batch-read stores). Must be specified per store; ~8 TTL stores total.
- **Watchdog orphan-scan** (`packages/bot/src/utils/music/watchdog.ts`) currently does
  `redisClient.keys('music:session:*')` — Postgres requires an **indexed `guildId` column**, not a
  table scan every 60s.
- Removing Redis as a cache layer removes the Postgres-down fallback cushion. Acceptable at this
  scale (single instance; Redis + Postgres are co-hosted, so failures correlate anyway).
- Bot startup currently throws on Redis-unavailable — that throw must become pub/sub-only.

## Revisit when

- **Bot goes multi-instance** → in-memory caches and any in-process state break; a shared store
  (Redis or Postgres) is required again, and the pub/sub `LISTEN/NOTIFY`-vs-Redis question reopens.
- **Postgres write latency** from former-Redis hot paths (spam tracking, counters) becomes
  measurable → reconsider keeping those specific stores on Redis.
- **Eliminating the Redis container entirely** becomes worth it (cost/ops) → take up Option B
  (re-architect the music IPC) as its own gated decision.
- The Phase-0 `TrackHistory` prototype exposes >3 friction points or needs >2 shims → escalate to
  `/research-and-decide` before migrating the remaining stores.

Related: [[2026-05-30-observability-remediation-strategy]], [[2026-05-19-queue-resolver-defensive-fallback-chain]].
