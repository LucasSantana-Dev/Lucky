-- Create ModDigestConfig table for moderation digest scheduling
-- Stores per-guild configuration for weekly moderation activity digests.
-- Previously stored in Redis; migrating to Postgres for durability.
-- Indexes: guildId (unique), enabled (for listEnabledGuildIds scan).

CREATE TABLE IF NOT EXISTS "mod_digest_config" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guildId" TEXT NOT NULL UNIQUE,
    "channelId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSentAt" BIGINT,
    "createdAt" BIGINT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mod_digest_config_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("discordId") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Index for listEnabledGuildIds query (WHERE enabled = true)
CREATE INDEX "mod_digest_config_enabled_idx" ON "mod_digest_config"("enabled");
