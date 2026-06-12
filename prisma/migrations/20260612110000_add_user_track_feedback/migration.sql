-- CreateTable user_track_feedbacks
-- Track explicit per-track 👍/👎 feedback with 30-day TTL.
-- Per-user/guild/track combination; duplicates upsert on (discordUserId, guildId, trackKey).
-- Lazy-prune on read (deleteMany expired); decay computed at read time.

CREATE TABLE "user_track_feedbacks" (
    "id" TEXT NOT NULL,
    "discordUserId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "trackKey" TEXT NOT NULL,
    "feedback" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_track_feedbacks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: composite for upsert lookup
CREATE UNIQUE INDEX "user_track_feedbacks_discordUserId_guildId_trackKey_key" ON "user_track_feedbacks"("discordUserId", "guildId", "trackKey");

-- CreateIndex: for user/guild scoped queries
CREATE INDEX "user_track_feedbacks_discordUserId_guildId_idx" ON "user_track_feedbacks"("discordUserId", "guildId");

-- CreateIndex: for lazy-prune query (deleteMany where expiresAt < now())
CREATE INDEX "user_track_feedbacks_expiresAt_idx" ON "user_track_feedbacks"("expiresAt");

-- Foreign keys
ALTER TABLE "user_track_feedbacks"
    ADD CONSTRAINT "user_track_feedbacks_discordUserId_fkey"
    FOREIGN KEY ("discordUserId") REFERENCES "users"("discordId")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_track_feedbacks"
    ADD CONSTRAINT "user_track_feedbacks_guildId_fkey"
    FOREIGN KEY ("guildId") REFERENCES "guilds"("discordId")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Enum-like constraints on feedback field
ALTER TABLE "user_track_feedbacks"
    ADD CONSTRAINT "user_track_feedbacks_feedback_check"
    CHECK ("feedback" IN ('like', 'dislike'));
