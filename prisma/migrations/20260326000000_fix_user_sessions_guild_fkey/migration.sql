-- Ensure guilds.discordId has a unique constraint so it can be used as a FK target.
-- CREATE UNIQUE INDEX IF NOT EXISTS is safe to run even if the index already exists.
CREATE UNIQUE INDEX IF NOT EXISTS "guilds_discordId_key" ON "guilds"("discordId");

-- Add the FK from user_sessions.guildId -> guilds.discordId.
-- Wrapped in a DO block so it is a no-op if the constraint already exists.
DO $$ BEGIN
    ALTER TABLE "user_sessions"
        ADD CONSTRAINT "user_sessions_guildId_fkey"
        FOREIGN KEY ("guildId") REFERENCES "guilds"("discordId")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add the FK from user_sessions.userId -> users.discordId.
-- Same guard in case this was already applied.
DO $$ BEGIN
    ALTER TABLE "user_sessions"
        ADD CONSTRAINT "user_sessions_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "users"("discordId")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
