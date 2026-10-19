-- Landing source attribution (#2750). Additive only: one new table, one index.
-- No existing table or column is touched.

-- CreateTable
CREATE TABLE IF NOT EXISTS "guild_join_sources" (
    "guildDiscordId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guild_join_sources_pkey" PRIMARY KEY ("guildDiscordId")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "guild_join_sources_source_createdAt_idx" ON "guild_join_sources"("source", "createdAt");

-- Enable RLS (default-deny, no policies; matches command_events and the baseline tables)
ALTER TABLE "public"."guild_join_sources" ENABLE ROW LEVEL SECURITY;
