-- CreateTable
CREATE TABLE "guild_forum_threads" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guild_forum_threads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "guild_forum_threads_guildId_idx" ON "guild_forum_threads"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "guild_forum_threads_guildId_slug_key" ON "guild_forum_threads"("guildId", "slug");

-- AddForeignKey
ALTER TABLE "guild_forum_threads" ADD CONSTRAINT "guild_forum_threads_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("discordId") ON DELETE CASCADE ON UPDATE CASCADE;
