-- CreateTable
CREATE TABLE "twitch_notifications" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "twitchUserId" TEXT NOT NULL,
    "twitchLogin" TEXT NOT NULL,
    "discordChannelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "twitch_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "twitch_notifications_guildId_twitchUserId_key" ON "twitch_notifications"("guildId", "twitchUserId");

-- CreateIndex
CREATE INDEX "twitch_notifications_twitchUserId_idx" ON "twitch_notifications"("twitchUserId");

-- AddForeignKey
ALTER TABLE "twitch_notifications" ADD CONSTRAINT "twitch_notifications_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
