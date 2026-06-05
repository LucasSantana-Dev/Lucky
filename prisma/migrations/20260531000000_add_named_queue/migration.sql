-- Named saved queues (user-saved music sessions, restorable by name).
-- Part of the Redis scope-reduction (decisions/2026-05-31-redis-scope-reduction.md):
-- migrates NamedSessionService off Redis onto Postgres. Pre-cutover Redis-only
-- saved queues are not backfilled (they age out under the prior 30-day TTL anyway).

CREATE TABLE "named_queues" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "savedBy" TEXT NOT NULL,
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trackCount" INTEGER NOT NULL,
    "voiceChannelId" TEXT,
    "currentTrack" JSONB,
    "upcomingTracks" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "named_queues_pkey" PRIMARY KEY ("id")
);

-- One saved queue per (guild, name); replaces the Redis per-key uniqueness.
CREATE UNIQUE INDEX "named_queues_guildId_name_key" ON "named_queues" ("guildId", "name");

-- Lookup/list by guild.
CREATE INDEX "named_queues_guildId_idx" ON "named_queues" ("guildId");

ALTER TABLE "named_queues" ADD CONSTRAINT "named_queues_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
