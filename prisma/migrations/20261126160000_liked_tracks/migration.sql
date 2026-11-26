-- Liked songs (/like, /liked): one row per member and song, kept until the
-- member removes it. Additive only: one new table and its indexes.
-- Idempotent (IF NOT EXISTS), per the migration gate.

-- CreateTable
CREATE TABLE IF NOT EXISTS "liked_tracks" (
    "id" TEXT NOT NULL,
    "discordUserId" TEXT NOT NULL,
    "trackKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "duration" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "likedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "liked_tracks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "liked_tracks_discordUserId_trackKey_key" ON "liked_tracks"("discordUserId", "trackKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "liked_tracks_discordUserId_likedAt_idx" ON "liked_tracks"("discordUserId", "likedAt");

-- Enable RLS (default-deny, no policies; matches the other tables)
ALTER TABLE "public"."liked_tracks" ENABLE ROW LEVEL SECURITY;
