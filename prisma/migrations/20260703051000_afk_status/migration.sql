-- AFK status tracking: user-initiated away status with optional reason.
CREATE TABLE "afk_statuses" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" TEXT,
    "since" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "afk_statuses_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds" ("discordId") ON DELETE CASCADE
);

-- Unique constraint: one AFK status per (guildId, userId) pair.
CREATE UNIQUE INDEX "afk_statuses_guildId_userId_key" ON "afk_statuses"("guildId", "userId");
