# Guild FK constraints: target discordId, cascade on guild dependents, no user FKs

- Status: accepted
- Date: 2026-06-12

## Context

The Lucky schema has 40+ models that store a `guildId` column referencing Discord guild snowflakes (a 64-bit unsigned integer). However, prior to this ADR, most of these models had no FK constraint at all, or (in 5 cases) had constraints targeting the wrong column:
- **Wrong target:** guilds.id (CUID — a client-generated unique identifier, never what writers store)
- **Correct target:** guilds.discordId (Discord snowflake, @unique, what all Discord event payloads and writers actually use)

This left the database vulnerable to orphaned rows if a guild was ever deleted or its discordId corrupted — a referential-integrity gap that contradicts our tier-2 data quality commitment (see decisions/2026-06-10-fix-queue-delivery-model.md, which deferred queue resilience to correct-DB-constraints-first).

A prior incident (2026-06-08, fix_music_guild_fks) corrected three music-specific FKs (TrackHistory, NamedQueue, MusicSessionSnapshot, GuildCounter). This ADR extends that principle to the full schema.

## Decision

### Convention: guild FKs always target discordId

Every guild-dependent model must carry:
```prisma
guildId String
guild Guild @relation(fields: [guildId], references: [discordId], onDelete: Cascade)
```

This establishes discordId as the canonical FK target across the entire schema (it is the Discord-assigned ID, never changes, and is already @unique on guilds).

### Group A: retarget 5 wrong FKs

The following models currently reference guilds(id) and must be corrected:

1. **GuildFeatureToggle** — `references: [id]` → `references: [discordId]`, onDelete: Cascade
2. **TwitchNotification** — `references: [id]` → `references: [discordId]`, onDelete: Cascade
3. **GuildSettings** — `references: [id]` → `references: [discordId]`, onDelete: Cascade
4. **GuildSession** — `references: [id]` → `references: [discordId]`, onDelete: Cascade
5. **CommandUsage** — `references: [id]` → `references: [discordId]`, onDelete: SetNull (guildId is nullable; preserve telemetry)

### Group B: add missing FKs

The following 20 models store guildId but have no FK constraint today. All receive `onDelete: Cascade`:

GuildRoleGrant, GuildAutomationManifest, GuildAutomationRun, GuildAutomationDrift, Download, RoleExclusion, ModerationCase, ModerationSettings, AutoModSettings, EmbedTemplate, AutoMessage, CustomCommand, ServerLog, StarboardEntry, LevelConfig, MemberXP, LevelReward, AutoRole, MemberBirthday, GuildSubscription.

### Explicitly NOT adding user FKs

The following models store Discord user IDs in nullable or non-FK columns:

- **MemberXP.userId** — stores Discord user ID; no users table row is guaranteed. Left as-is.
- **MemberBirthday.userId** — stores Discord user ID; no users table row is guaranteed. Left as-is.

User FKs only exist for rows that were created after a user authenticated (User, UserPreferences, UserArtistPreference, UserTrackFeedback); we do not retroactively enforce FKs on event-payload user IDs.

### Nullable guildId: SetNull, NOT NULL guildId: Cascade

CommandUsage.guildId is nullable (telemetry rows from DM commands or guild-less contexts). Its FK uses `onDelete: SetNull` so that if a guild is deleted, the row survives with `guildId = NULL`.

All other guildId columns are NOT NULL (25 models). Their FKs use `onDelete: Cascade` so deletion is transitive.

### Migration strategy: orphan cleanup first

For each table receiving a constraint:
- **NOT NULL guildId:** `DELETE FROM "<table>" WHERE "guildId" NOT IN (SELECT "discordId" FROM "guilds");` removes any orphaned rows before the constraint is created.
- **Nullable guildId (CommandUsage only):** `UPDATE "<table>" SET "guildId" = NULL WHERE "guildId" IS NOT NULL AND "guildId" NOT IN (SELECT "discordId" FROM "guilds");` preserves the row (telemetry) and nullifies the invalid guildId.

This matches the precedent in 20260608000000_fix_music_guild_fks.

### Forward-looking safety, not backward-prevention

Guilds are never deleted in production code today (leave events write to GuildMembershipEvent and `leftAt`, but the Guild row is soft-deleted via `leftAt = now()`; hard deletes do not exist). These constraints are forward-looking guards to catch bugs in future code.

## Already correct (no changes)

TrackHistory, NamedQueue, MusicSessionSnapshot, and GuildCounter all already reference guilds(discordId) with onDelete: Cascade (fixed by 20260608000000_fix_music_guild_fks). Do not touch these.

## Consequences

- Positive: referential integrity across 25 guild-dependent models; hard enforcement at the DB layer prevents orphans from future code bugs.
- Negative: any test fixture or integration test using a real DB must ensure a parent Guild row exists before inserting into these tables; no new code can violate the constraint.
- Neutral: production code (which already writes valid snowflakes to guildId) is unaffected.

## Revisit when

- More guild-dependent models are added to the schema → apply the same convention (guildId + guild @relation).
- A requirements change demands guild deletion → revisit cascades, audit what should soft-delete vs. hard-delete.
