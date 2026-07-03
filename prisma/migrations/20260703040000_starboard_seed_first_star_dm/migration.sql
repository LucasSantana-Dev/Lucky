-- Starboard engagement seeding + one-time first-star DM (per-guild config).
ALTER TABLE "starboard_configs" ADD COLUMN "seedReaction" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "starboard_configs" ADD COLUMN "seedChannelIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "starboard_configs" ADD COLUMN "firstStarDm" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "starboard_configs" ADD COLUMN "firstStarDmMessage" TEXT;

CREATE TABLE "starboard_dm_sents" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "starboard_dm_sents_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "starboard_dm_sents_guildId_userId_key" ON "starboard_dm_sents"("guildId", "userId");
CREATE INDEX "starboard_dm_sents_guildId_idx" ON "starboard_dm_sents"("guildId");
