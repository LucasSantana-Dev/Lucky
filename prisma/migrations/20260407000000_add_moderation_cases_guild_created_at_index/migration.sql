-- CreateIndex
CREATE INDEX "moderation_cases_guildId_createdAt_idx" ON "moderation_cases"("guildId", "createdAt");
