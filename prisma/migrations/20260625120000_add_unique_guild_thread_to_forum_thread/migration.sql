-- CreateIndex
CREATE UNIQUE INDEX "GuildForumThread_guildId_threadId_key" ON "guild_forum_threads"("guildId", "threadId");
