-- Add the three guild-settings fields that lived only in the Redis blob
-- (djRoleId, idleTimeoutMinutes, voteSkipThreshold) to the Postgres
-- guild_settings table. Part of the Redis scope-reduction
-- (decisions/2026-05-31-guild-settings-postgres-source-of-truth.md):
-- GuildSettingsService becomes Postgres source-of-truth, so every settings
-- field needs a column. Additive + nullable; existing rows keep defaults.

ALTER TABLE "guild_settings" ADD COLUMN "djRoleId" TEXT;
ALTER TABLE "guild_settings" ADD COLUMN "idleTimeoutMinutes" INTEGER DEFAULT 0;
ALTER TABLE "guild_settings" ADD COLUMN "voteSkipThreshold" INTEGER DEFAULT 50;
