# ADR 2026-06-04 — Guild FK target column + cascade semantics

**Status:** Accepted
**Issue:** #1181
**Related:** track_history FK fix (PR #1146, ADR-less hotfix), Sentry LUCKY-3N

## Context

`Guild` has two identifiers: `id String @id @default(cuid())` (CUID primary key) and `discordId String @unique` (the Discord snowflake — immutable, 17–20 digits). Investigation found that **every guild-dependent child table stores the Discord snowflake** in its `guildId` column (HTTP routes validate `guildId` as a snowflake; bot handlers pass `guild.id`; no write path resolves snowflake→CUID first — e.g. `GuildSettingsService.setGuildSettings` upserts the raw `guildId`).

Yet the existing FKs target the CUID PK:

- **9 models already FK → `guilds.id` (CUID):** GuildSettings, GuildSession, GuildFeatureToggle, TwitchNotification, CommandUsage, NamedQueue, MusicSessionSnapshot, GuildCounter (+ TrackHistory, already re-pointed to `discordId` in PR #1146).
- These FKs only resolve for guild rows whose `guilds.id` legacy-equals the snowflake; they break for guilds created with auto-CUID ids. LUCKY-3N (track_history, ~20 events) was the first symptom.
- **~19 models have NO Guild FK at all** (orphan-row risk): ModerationCase, ModerationSettings, AutoModSettings, CustomCommand, EmbedTemplate, AutoMessage, ServerLog, StarboardEntry, LevelConfig, MemberXP, LevelReward, AutoRole, MemberBirthday, GuildRoleGrant, GuildAutomationManifest/Run/Drift, ReactionRoleMessage, RoleExclusion, Download, GuildSubscription.

The `guilds.id` CUID is effectively vestigial — nothing references it correctly.

## Decision

**FK target = `guilds.discordId`** for all guild-dependent models. It is `@unique` (Postgres allows a FK to reference any unique column, Prisma backs it with the unique index), immutable, and already equals every child `guildId` value — so re-targeting needs **no data backfill**. This also retro-corrects the 9 existing mis-targeted FKs.

**Cascade policy is per-model, NOT uniform Cascade** (critic finding — audit/telemetry must survive guild deletion):

- **`onDelete: Cascade`** — guild-scoped state with no audit value: GuildSettings, GuildSession, GuildFeatureToggle, GuildCounter, MusicSessionSnapshot, NamedQueue, LevelConfig, MemberXP, LevelReward, AutoRole, MemberBirthday, AutoMessage, EmbedTemplate, CustomCommand, StarboardEntry, AutoModSettings, ModerationSettings, GuildRoleGrant, RoleExclusion, ReactionRoleMessage, GuildAutomationManifest, GuildSubscription.
- **`onDelete: SetNull` / keep (Restrict)** — audit & telemetry that must outlive a guild: ModerationCase, ServerLog, Recommendation, GuildAutomationRun, GuildAutomationDrift, Download, CommandUsage. (Requires `guildId` nullable where SetNull is chosen — decide per table during implementation.)

**Migration is phased (3 PRs), each preceded by a mandatory orphan scan:**

- **Phase A** — retarget the 9 existing (known-broken) FKs to `discordId`. Highest value (fixes live breakage).
- **Phase B** — add FKs to the high/medium-value unconstrained models (moderation, automod, custom commands, levels, embeds, automessages, starboard).
- **Phase C** — add FKs to the remaining low-frequency models.

**Mandatory precondition before each `ADD CONSTRAINT`** (critic finding — ADD CONSTRAINT fails if any child row's `guildId` has no matching `guilds.discordId`):

```sql
SELECT COUNT(*) FROM <child> c
LEFT JOIN guilds g ON c."guildId" = g."discordId"
WHERE g.id IS NULL;  -- must be 0, else backfill the Guild row or prune/triage the orphans first
```

## Alternatives considered

- **Make `discordId` the PK** (`@id` on discordId, drop the CUID). Cleanest long-term — eliminates the dual-identifier confusion. **Deferred, not rejected:** it's a larger migration (re-point every FK + change the PK) for the same immediate correctness as the discordId-FK retarget. Revisit trigger below.
- **Resolve snowflake→CUID at all ~24 write sites + backfill child columns to CUIDs.** Rejected — highest code churn + a data backfill of every child table, for no correctness gain over the FK retarget.
- **Uniform `onDelete: Cascade`** (original proposal). Rejected — would destroy moderation history / audit logs / recommendation telemetry on guild deletion.
- **Leave the 19 unconstrained.** Rejected — orphan rows already accumulate; the FK is the integrity guarantee.

## Consequences

**Positive:** matches what the data actually holds; no backfill; fixes the latent FK breakage on the 9 core tables (not just track_history); orphan rows become impossible going forward; cascade policy preserves audit/telemetry.

**Negative:** FKs reference a non-PK unique column (`discordId`) while `guilds.id` remains the PK — a documented special case future devs must understand (this ADR is that documentation). The orphan-scan precondition adds a manual gate per phase.

**Neutral:** `guilds.id` CUID stays as an unused-but-harmless internal PK until/unless the discordId-as-PK migration happens.

## Revisit when

- A new guild-dependent model is added → it must FK → `discordId` from day one (add to the schema-review checklist).
- The dual-identifier confusion causes another bug, OR ≥3 more models accumulate → escalate the **discordId-as-PK** migration (the deferred alternative).
- An orphan scan returns non-zero on any phase → pause, triage the orphans (backfill vs prune) before proceeding.
