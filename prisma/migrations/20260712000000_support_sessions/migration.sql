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

-- Enforce one OPEN ticket per (guild, requestor) at the DB level so concurrent
-- /ticket open invocations can't race past the app-level check. Partial unique
-- indexes are not expressible in schema.prisma, so this lives only in the
-- migration (the generated client is unaffected; there is no CI drift check).
CREATE UNIQUE INDEX "support_sessions_one_open_per_user"
    ON "support_sessions"("guildId", "requestorId")
    WHERE "status" = 'open';

-- AddForeignKey
ALTER TABLE "support_sessions" ADD CONSTRAINT "support_sessions_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("discordId") ON DELETE CASCADE ON UPDATE CASCADE;

-- Constrain the finite lifecycle state so a bad value can never become invisible
-- to the active-ticket / expiry-sweep queries. (Not expressible in schema.prisma;
-- migration-only, no CI drift check runs.)
ALTER TABLE "support_sessions" ADD CONSTRAINT "support_sessions_status_check" CHECK ("status" IN ('open', 'closed'));
