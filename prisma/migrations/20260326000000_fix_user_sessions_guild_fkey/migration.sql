-- Clean up legacy FK constraints on user_sessions.
-- The UserSession model has been removed from the Prisma schema; the
-- user_sessions table is now unmanaged.  We drop any pre-existing FK
-- constraints so the table does not reference columns that may lack
-- the required unique indexes (guilds.discordId, users.discordId).

DO $$ BEGIN
    ALTER TABLE "user_sessions" DROP CONSTRAINT "user_sessions_guildId_fkey";
EXCEPTION WHEN undefined_object THEN NULL;
         WHEN undefined_table  THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE "user_sessions" DROP CONSTRAINT "user_sessions_userId_fkey";
EXCEPTION WHEN undefined_object THEN NULL;
         WHEN undefined_table  THEN NULL;
END $$;
