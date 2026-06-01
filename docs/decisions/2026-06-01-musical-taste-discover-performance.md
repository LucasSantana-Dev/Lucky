# ADR — Musical Taste / Discover performance: bound-and-degrade + bounded in-memory caches (gated on Spotify quota-mode)

- **Date:** 2026-06-01
- **Status:** Accepted — gate cleared 2026-06-01 (see §0); proceed with the operational fix.
- **Owner:** Lucas Santana
- **Related:** Musical Taste page hangs (Image #4, 2026-06-01 grill); plan
  `.claude/plans/2026-06-01-musical-taste-perf.md`; decided via `/research-and-decide`
  (4-lens research + critic, verdict REVISE). Builds on
  `2026-05-31-redis-scope-reduction` + `2026-06-01-drop-redis-read-through-caches`.

## Context

The dashboard "Musical Taste" Discover tab spins for many seconds / never resolves
(Discover shows 0 while Preferred shows 48). Root cause (verified):
`ArtistSuggestionService.getSuggestions` (`packages/backend/src/services/artistSuggestion.ts`)
runs a sequential, **timeout-free** three-tier lookup — Tier 1 Postgres preferred
artists, Tier 2 Spotify `/me/top/artists` ×3 time-ranges (user OAuth), Tier 3 a
~20-call Spotify popular-search loop — with the Tier 2/3 results cached in
**`redisClient`**. Redis is being decommissioned (KV → Postgres/in-memory; Redis kept
only for music pub/sub), so those caches miss every load → full synchronous Spotify
fetch on every request. With no timeout anywhere (backend tiers OR the frontend
`getSuggestions` await), a slow/failing Spotify call hangs the tab indefinitely.

Spotify 2026 reality (researched, partially uncertain): `/me/top/artists` still works
(requires user OAuth `user-top-read`, not client-credentials); the Nov-2024
deprecations killed Related Artists/Recommendations/Audio-Features for new apps (Lucky
already routes "related" through a Last.fm `getSimilar` + name-lookup workaround). If
Lucky's Spotify app is in **Development Mode** (5-user cap, lower limits), 429s — not
latency — may be the real recurring cause. The app's quota mode is NOT determinable
from code.

Hobby scale: single instance, co-located Postgres, LOW maintenance budget.

## Decision

### §0 — GATE (do this first, it can change the answer)

Before implementing, verify whether the failure is **latency** (a timeout cures it) or
**Spotify quota exhaustion** (a timeout only masks it): scan Sentry for `429`/Spotify
errors on the suggestions path over the last 7 days, and check the app's quota mode.

- If 429s are rare/absent → proceed with §1–§4 below.
- **If dev-mode 429s dominate → the operational fix is insufficient; flip to Option 3
  (Last.fm-all-in for Discover) or request Spotify Extended Quota** (see Alternatives).

**GATE RESULT (2026-06-01, Sentry scan of project `lucky`):** ZERO Spotify 429s. Backend
Sentry capture is confirmed working (live Prisma errors + Discord-API 429s present), so the
absence is meaningful. The only 429s are `DiscordApiError: Failed to fetch user guilds: 429`
on guild-context resolution for dashboard pages (`/moderation/cases`, `/logs`, `/automod/*`,
`/commands`, `/channels`) — a SEPARATE issue (Discord, not Spotify; likely also degrading
the mod-cases/logs pages). PROCEED with the operational fix (§1–§4); do NOT flip to Last.fm.
Caveat: the suggestions code catches Spotify errors gracefully (logged, not thrown), so a
429 there would not surface as a Sentry issue — §3 observability confirms post-fix, and the
429-rate revisit trigger stays in force.

### §1 — Bound and degrade (the hang fix)

Wrap EVERY tier — including the Tier 1 Postgres read — in a hard per-tier timeout
(~5 s via `Promise.race`) + try/catch. On timeout/error, skip to the next tier and
return whatever was collected (Tier 1 + partial). The endpoint ALWAYS returns within a
bounded time with a 200 (results or empty + a message); it never hangs.

### §2 — Caches off Redis → bounded in-memory

Replace the `redisClient` caches with **bounded** in-memory caches (execute the Redis
arc for this service; suggestions are regenerable, i.e. "ephemeral → in-memory" per the
Redis ADR taxonomy):

- Tier 3 global popular: a module-level TTL value populated at startup (replaces the
  `prewarmCache` Redis path).
- Tier 2 per-user top: an LRU with an explicit **size cap** (e.g. 500 entries) + TTL —
  NOT an unbounded Map (critic finding). Reuse/introduce a small shared `TtlMap`.

### §3 — Observability

Emit per-tier metrics (tier reached, latency, Spotify status incl. 429) so silent
degradation (always-Tier-1) is visible and the revisit triggers below can fire.

### §4 — Frontend

Add an `AbortController` timeout (matching the backend bound) + an error state to
`PreferredArtists.tsx`'s suggestions load. **Do NOT** add Tier1-first streaming
(rejected as scope creep — the backend bound + Tier-1 fast path already prevent the hang).

## Alternatives considered

1. **Postgres cache table for Tier 2** (`SpotifyArtistCache`) — _rejected for now._ The
   "Postgres SoT" intent fits, and it survives restarts/multi-instance, but it adds a
   table + migration + TTL sweep for data that is regenerable/ephemeral. Bounded
   in-memory is simpler for a single-instance hobby app. **Revisit if Lucky scales out.**
2. **Last.fm-all-in (drop Spotify Tier 2/3)** — _deferred / conditional._ No Spotify
   rate-limit/quota risk, and Last.fm is already the "related artists" backend. Becomes
   the RIGHT answer **iff §0 shows dev-mode 429s are the root cause.** Bigger product
   change + weaker for users without Last.fm scrobbles.
3. **Background job/queue (Bull/BullMQ)** — _rejected._ Bull is Redis-backed (conflicts
   with decommission) and ~400 LOC; overkill for hobby scale.
4. **Status quo + timeout only (keep Redis)** — _rejected._ Contradicts the Redis-removal
   ADRs and leaves the cache-miss-every-load problem.

## Consequences

**Positive:** never hangs (bounded + degrade); executes the Redis-removal arc for this
service; degradation becomes observable; minimal new infra.
**Negative / accepted:** in-memory cache is lost on deploy/restart → first Discover load
re-fetches from Spotify (bounded by the timeout); multi-instance scale-out would make
per-process caches stale (revisit → Postgres); per-user cache evicts LRU past the cap.
**Neutral:** a small `TtlMap` util + per-tier metrics enter the codebase.

## Revisit when

- §0/observability shows Spotify **429 rate > ~5–10%** of Discover requests → adopt
  **Last.fm-all-in** (alt 2) or apply for Spotify Extended Quota.
- Lucky scales to **multiple instances** → move per-user Tier 2 cache to **Postgres** (alt 1).
- In-memory **evictions** are frequent / memory pressure observed → raise cap or move to Postgres.
- Spotify deprecates `/me/top/artists` or tightens user-OAuth access → re-evaluate the
  whole Discover source (Last.fm).
