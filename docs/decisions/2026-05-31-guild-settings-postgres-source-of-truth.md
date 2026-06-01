---
status: accepted
date: 2026-05-31
refines: 2026-05-31-redis-scope-reduction
revisit_after: when a revisit trigger below fires
---

# Guild settings: Postgres is the source of truth, read directly (no cache)

## Status

Accepted. Refines [[2026-05-31-redis-scope-reduction]] for the `GuildSettings` store
specifically. Decided via research + Opus `critic` (critic confirmed Option A, did not
flip it; surfaced a pre-existing split-brain that sharpens the decision).

## Context

`GuildSettingsService` reads/writes guild settings (volume, prefix, autoplayMode,
repeatMode, language, cooldowns, allow\* perms, djRole) to **Redis only**, key
`guild_settings:{guildId}`, with a **7-day `setex` TTL**.

But a Postgres model `GuildSettings` (table `guild_settings`, `guildId @unique`,
`Guild.settings` relation) **already exists** with the same fields — and is **actively
read/written by the birthday feature** (`birthdayScheduler.ts`, `birthday.ts` via
`prisma.guildSettings`). So one logical entity has **two live, unsynced stores**:
birthday columns in Postgres, music/perm settings in Redis. This is a split-brain, and
the 7-day TTL means music settings silently reset (config loss) on expiry/restart.

Settings are read on most bot command hot paths (~15 call sites: play/autoplay/cooldown
checks), plus backend REST + frontend.

## Decision

**Postgres `guild_settings` is the single source of truth. `GuildSettingsService` reads
and writes `prisma.guildSettings` directly, with no cache layer. Drop the Redis settings
path.** This unifies the music/perm settings with the birthday columns already in that
same row.

No cache, deliberately: a cache is what creates cross-process staleness (backend web-UI
write vs bot read) and, if Redis-backed, would re-add the dependency this refactor is
removing. For a single-instance bot with a co-located Postgres, a direct read per command
is cheap and always fresh — no invalidation mechanism needed. Postgres errors surface as
errors (callers already handle a null/empty settings result by falling back to defaults).

## Alternatives considered

- **B — Postgres SoT + in-process (Map) read cache, short TTL.** Rejected for now: adds
  cross-process staleness (bot serves stale settings for up to the TTL after a web-UI
  change) for a latency win not yet shown to be needed. Add only if a revisit trigger fires.
- **C — Postgres SoT + read-through Redis cache + write-invalidation** (mirrors
  `AutoModService`). Rejected: keeps/extends Redis, directly against the parent ADR's
  shrink-to-pub/sub-only goal. (AutoMod settings cache is itself a future revisit candidate.)
- **D — status quo (Redis SoT, 7-day TTL).** Rejected: this _is_ the split-brain + the
  silent-config-reset bug.

## Consequences

Positive: one source of truth; split-brain with birthday data resolved (same row); config
survives restarts; one fewer Redis consumer; no cache ⇒ no invalidation/staleness logic.

Negative / accept:

- One Postgres read per settings access on bot command hot paths. Acceptable single-instance
  with local Postgres; measure if it ever feels slow (revisit trigger).
- **Cutover:** best-effort one-time backfill `redis.get(guild_settings:{guildId}) →
prisma.guildSettings.upsert()` for known guilds before removing the Redis path. If a key
  already expired (7-day TTL), that guild reverts to defaults — acceptable for a hobby bot,
  and birthday columns are preserved by upsert. Backfill count must be logged + verified.
- Birthday writes and settings writes now target the same Postgres row — confirm no field
  collision (they touch disjoint columns today).

## Revisit when

- Per-command Postgres read latency becomes measurably noticeable on hot paths → add
  Option B (in-process cache, short TTL). Only then.
- Bot goes multi-instance → re-evaluate cache coherence (same trigger as the parent ADR).
- A web-UI settings change must be reflected in the bot in <1s AND a cache has been added →
  needs an invalidation signal (pub/sub), revisit then.

## Implementation notes (for the spec, not part of the decision)

Per critic: the PR must (1) unify the birthday path under the same Postgres model, (2) ship
the one-time Redis→Postgres backfill + verification + a note that expired keys reset to
defaults, (3) since there is no cache, explicitly confirm no invalidation is needed.
