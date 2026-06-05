-- Music session snapshots (one per guild): auto-saved queue state for restore-after-restart.
-- Part of the Redis scope-reduction (decisions/2026-05-31-redis-scope-reduction.md):
-- migrates MusicSessionSnapshotService off Redis onto Postgres. One row per guild,
-- overwritten on each save (upsert) and deleted after a successful restore.

CREATE TABLE "music_session_snapshots" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "sessionSnapshotId" TEXT NOT NULL,
    "savedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currentTrack" JSONB,
    "upcomingTracks" JSONB NOT NULL,
    "voiceChannelId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "music_session_snapshots_pkey" PRIMARY KEY ("id")
);

-- One snapshot per guild (replaces the Redis per-guild key `music:session:<guildId>`).
CREATE UNIQUE INDEX "music_session_snapshots_guildId_key" ON "music_session_snapshots" ("guildId");

ALTER TABLE "music_session_snapshots" ADD CONSTRAINT "music_session_snapshots_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
