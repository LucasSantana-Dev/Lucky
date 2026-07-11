-- CreateTable
CREATE TABLE "channel_cleanup_configs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "intervalMinutes" INTEGER,
    "ttlSeconds" INTEGER,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "channel_cleanup_configs_guildId_channelId_key" UNIQUE ("guildId", "channelId")
);

CREATE INDEX "channel_cleanup_configs_enabled_mode_idx" ON "channel_cleanup_configs"("enabled", "mode");
ALTER TABLE "channel_cleanup_configs" ADD CONSTRAINT "channel_cleanup_configs_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("discordId") ON DELETE CASCADE ON UPDATE CASCADE;
