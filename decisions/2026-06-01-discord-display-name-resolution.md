# ADR — Resolving Discord user IDs to display names: denormalize at write-time, not a shared identity cache

- **Date:** 2026-06-01
- **Status:** Accepted
- **Owner:** Lucas Santana
- **Related:** levels leaderboard shows raw IDs (Image #3 in the 2026-06-01 grill); plan
  `.claude/plans/2026-06-01-display-name-denorm.md`; decided via `/research-and-decide`
  (4-lens research + critic). Precedent: `ModerationCase` / `ServerLog` denorm.

## Context

Several dashboard surfaces render raw numeric Discord user IDs instead of names. The
clear case is the **levels leaderboard**: `LevelService.getLeaderboard` is
`prisma.memberXP.findMany({orderBy:{xp}})`, and `MemberXP {guildId,userId,xp,level}`
stores **no name**, so the UI prints e.g. `282294772570521600`. The ask was plural
("several places... nicknames"), and "nicknames" means the **guild-scoped** display
name (nickname → global_name → username).

Verified repo facts that shaped the choice:

- `ModerationCase {username @default("Unknown")}` already **denormalizes the name at
  write-time** (the bot writes `user.tag` when a case is created).
- `ServerLog` already denormalizes names into its `details` JSON at write
  (`auditHandler.ts` writes `authorTag`, and `username`/`tag` for bans); the logs page
  renders `log.userName` when present. The screenshot with no names is an incomplete
  `details → userName` **mapping**, not missing data.
- **`MemberXP` is the only surface with no name at all** — the real gap.
- The bot enables only `Guilds, GuildMessages, GuildVoiceStates, MessageContent,
GuildMessageReactions` — **NOT** the privileged `GuildMembers` intent — so
  `GuildMemberUpdate/Add` events do not fire. But XP is granted on `MESSAGE_CREATE`,
  where `message.member.displayName` (incl. guild nickname) **is** available without
  any privileged intent.
- 2026 Discord REST limits: per-route member/user fetch ~1 req/s (30/30s), global
  50/s, per-guild buckets + an Aug-2025 per-guild member-list limit. So resolving
  names via REST at render is a 429 footgun, especially for logs (many distinct users).
- Hobby scale (tens–hundreds of members/guild), Postgres is source of truth, LOW
  maintenance budget.

## Decision

**Resolve IDs → display names by denormalizing the display name at write-time on each
surface, extending the existing `ModerationCase`/`ServerLog` precedent to the levels
leaderboard.** Concretely:

1. Add `displayName String?` (and optionally `avatar String?`) to `MemberXP`. Capture
   it from `message.member.displayName` at XP-grant time in the bot's `xpHandler`
   (no privileged intent — `message.member` is in the guild MESSAGE_CREATE payload).
   The leaderboard API returns it; the frontend renders `displayName` and falls back to
   the raw ID only when absent.
2. Fix the `ServerLog` `details → userName` mapping so the already-denormalized name
   (`details.authorTag` / `username`) surfaces in the logs UI. No schema change.
3. `ModerationCase` already denormalizes — no change.
4. One-time best-effort backfill of historical `MemberXP.displayName` (from the global
   `User` cache where present; otherwise leave null → resolves on the member's next
   message). Raw-ID fallback covers nulls.

The render fallback chain everywhere is `displayName/nickname → globalName → username
→ rawId`.

## Alternatives considered

1. **Shared `GuildMember` identity cache** `{guildId,userId,nickname,globalName,username,
avatar}` populated by the bot, read by all surfaces, with a throttled lazy-REST
   backfill for cold misses — _rejected (for now)._ It is the cleaner long-term
   consolidation, but: the bot already has `message.member` at every write-point (so a
   separate cache buys little over denorm); the lazy-REST backfill is a 429 risk the
   critic flagged (and is unsafe for logs' many distinct users); it duplicates the
   existing global `User` table; and it is over-engineered for hobby scale. **This is
   the designated escape hatch** (see Revisit).
2. **Enable the `GuildMembers` privileged intent + event-driven cache refresh** —
   _rejected._ Gives free rename-refresh without a message, but requires a portal+code
   privileged-intent change and discord.js member-cache memory tuning (auto-caches all
   members). Not justified at hobby scale; staleness tolerance is high.
3. **Expand the global `User` cache + JOIN** — _rejected._ `User` is global and cannot
   represent per-guild **nicknames**, which the ask requires.
4. **Lazy REST resolve at render (no persistence)** — _rejected._ Per-route ~1 req/s +
   per-guild limits → 429 storms and page-load latency; catastrophic for logs.

## Consequences

**Positive**

- Minimal, proven (mirrors `ModerationCase`), works with current intents, zero
  Discord-REST rate-limit risk, no new table/identity duplication.
- Guild nicknames supported (captured via `member.displayName`).
- Generalizes by the same one-line write-time capture if a new surface appears.

**Negative / accepted limits**

- A renamed member shows their **old** name until their next activity on that surface
  (next message for leaderboard). Fine for active leaderboards; staler for long-inactive
  members shown on a surface.
- Per-surface denorm (a small field on each surface that shows users) rather than one
  shared read. Accepted — it's the codebase idiom and avoids the cache's complexity.
- Historical `MemberXP` rows show raw IDs until their owner next messages (or the
  best-effort backfill fills them).

**Neutral**

- Adds 1–2 nullable columns to `MemberXP` + a write-time capture; a frontend/backend
  mapping fix for logs.

## Revisit when

Adopt the shared `GuildMember` cache (alternative 1), possibly with the `GuildMembers`
intent (alternative 2), when ANY of these hold:

- A surface must show names for users with **no natural write-context** (e.g. a full
  member list, or accurate names for long-inactive members).
- **Real-time** rename freshness becomes a product requirement.
- Guild sizes grow large enough (≈ >5k members) that denorm staleness or duplication
  becomes a real complaint.
- A **fourth+** surface needs identity and per-surface denorm becomes a maintenance drag.

## Privacy

Denormalized names live on existing rows (`MemberXP`, `ServerLog`, `ModerationCase`) and
inherit those rows' lifecycle. Delete a guild's rows on guild-leave; align retention
with existing log/XP retention. No new long-lived identity store is introduced.
