-- Per-guild music counters (autoplay recommendation count + repeat count).
-- Part of the Redis scope-reduction (docs/decisions/2026-05-31-redis-scope-reduction.md):
-- migrates the autoplay/repeat counters out of the Redis-backed GuildSettingsService
-- onto Postgres. One row per guild. (Settings + rate-limiting are NOT migrated here:
-- settings stay on Redis for now; rate-limiting moves to in-memory.)

CREATE TABLE "guild_counters" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "autoplayCount" INTEGER NOT NULL DEFAULT 0,
    "autoplayLastReset" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "repeatCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guild_counters_pkey" PRIMARY KEY ("id")
);

-- One counter row per guild.
CREATE UNIQUE INDEX "guild_counters_guildId_key" ON "guild_counters" ("guildId");

ALTER TABLE "guild_counters" ADD CONSTRAINT "guild_counters_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
