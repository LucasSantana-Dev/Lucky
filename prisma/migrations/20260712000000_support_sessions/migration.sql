-- AlterTable
ALTER TABLE "guild_settings" ADD COLUMN "supportCategoryId" TEXT;
ALTER TABLE "guild_settings" ADD COLUMN "supportAgentRoleId" TEXT;

-- CreateTable
CREATE TABLE "support_sessions" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "requestorId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "support_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "support_sessions_channelId_key" ON "support_sessions"("channelId");

-- CreateIndex
CREATE INDEX "support_sessions_guildId_idx" ON "support_sessions"("guildId");

-- CreateIndex
CREATE INDEX "support_sessions_status_expiresAt_idx" ON "support_sessions"("status", "expiresAt");

-- AddForeignKey
ALTER TABLE "support_sessions" ADD CONSTRAINT "support_sessions_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("discordId") ON DELETE CASCADE ON UPDATE CASCADE;
