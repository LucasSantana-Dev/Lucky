-- Fix user_sessions foreign keys to reference primary keys (id) instead of discordId.
-- Referencing a primary key is always safe; referencing discordId requires an explicit
-- unique constraint that may be absent on databases initialised via db push.

-- Drop the discordId-based FK constraints if they were previously created.
DO $$ BEGIN
    ALTER TABLE "user_sessions" DROP CONSTRAINT "user_sessions_guildId_fkey";
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "user_sessions" DROP CONSTRAINT "user_sessions_userId_fkey";
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- Add corrected FK: user_sessions.guildId -> guilds.id (primary key)
DO $$ BEGIN
    ALTER TABLE "user_sessions"
        ADD CONSTRAINT "user_sessions_guildId_fkey"
        FOREIGN KEY ("guildId") REFERENCES "guilds"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add corrected FK: user_sessions.userId -> users.id (primary key)
DO $$ BEGIN
    ALTER TABLE "user_sessions"
        ADD CONSTRAINT "user_sessions_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "users"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
