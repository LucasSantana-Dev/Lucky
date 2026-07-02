-- AlterTable
ALTER TABLE "twitch_notifications" ADD COLUMN "mentionRoleId" TEXT;

-- CreateTable
CREATE TABLE "scheduled_event_notifications" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "mentionRoleId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduled_event_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rss_feed_subscriptions" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "feedUrl" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "mentionRoleId" TEXT,
    "lastItemGuid" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rss_feed_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "scheduled_event_notifications_guildId_key" ON "scheduled_event_notifications"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "rss_feed_subscriptions_guildId_feedUrl_key" ON "rss_feed_subscriptions"("guildId", "feedUrl");

-- AddForeignKey
ALTER TABLE "scheduled_event_notifications" ADD CONSTRAINT "scheduled_event_notifications_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("discordId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rss_feed_subscriptions" ADD CONSTRAINT "rss_feed_subscriptions_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("discordId") ON DELETE CASCADE ON UPDATE CASCADE;
