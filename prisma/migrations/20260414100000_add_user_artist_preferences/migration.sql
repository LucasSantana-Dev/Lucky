-- CreateTable
CREATE TABLE "user_artist_preferences" (
    "id" TEXT NOT NULL,
    "discordUserId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "artistKey" TEXT NOT NULL,
    "artistName" TEXT NOT NULL,
    "spotifyId" TEXT,
    "imageUrl" TEXT,
    "preference" TEXT NOT NULL DEFAULT 'prefer',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_artist_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_artist_preferences_discordUserId_guildId_idx" ON "user_artist_preferences"("discordUserId", "guildId");

-- CreateUniqueIndex
CREATE UNIQUE INDEX "user_artist_preferences_discordUserId_guildId_artistKey_key" ON "user_artist_preferences"("discordUserId", "guildId", "artistKey");
