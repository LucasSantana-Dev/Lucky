-- Channel cleanup config table (#1687 feature).
--
-- Idempotent per decisions/2026-07-16-idempotent-migrations.md: IF NOT EXISTS
-- guards everywhere so a re-run after a partial-apply (prisma migrate deploy
-- is non-transactional) converges instead of erroring "relation already exists".

-- CreateTable
CREATE TABLE IF NOT EXISTS "channel_cleanup_configs" (
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

CREATE INDEX IF NOT EXISTS "channel_cleanup_configs_guildId_idx" ON "channel_cleanup_configs"("guildId");
CREATE INDEX IF NOT EXISTS "channel_cleanup_configs_enabled_mode_idx" ON "channel_cleanup_configs"("enabled", "mode");

-- Postgres has no ADD CONSTRAINT IF NOT EXISTS; guard the FK in a DO block.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'channel_cleanup_configs_guildId_fkey'
    ) THEN
        ALTER TABLE "channel_cleanup_configs"
            ADD CONSTRAINT "channel_cleanup_configs_guildId_fkey"
            FOREIGN KEY ("guildId") REFERENCES "guilds"("discordId")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
