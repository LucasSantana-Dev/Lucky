-- CreateTable LiveNotificationMessage
CREATE TABLE "live_notification_messages" (
    "id" TEXT NOT NULL,
    "discordChannelId" TEXT NOT NULL,
    "discordMessageId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "streamId" TEXT NOT NULL,
    "broadcastId" TEXT,
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "live_notification_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "live_notification_messages_discordChannelId_discordMessageId_key" ON "live_notification_messages"("discordChannelId", "discordMessageId");
CREATE INDEX "live_notification_messages_platform_streamId_idx" ON "live_notification_messages"("platform", "streamId");
