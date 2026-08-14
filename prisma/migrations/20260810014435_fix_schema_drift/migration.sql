-- Pre-existing drift between schema.prisma and applied migrations, found while
-- generating an unrelated migration. Filed as a GitHub issue; fixed here since
-- it was already surfaced by the diff.

-- reminders.guildId never had an FK to guilds — the original CreateTable
-- migration (20260703050000_reminders) omitted it despite schema.prisma
-- declaring the relation. Guild deletes did not cascade to reminders, so
-- rows referencing a since-deleted guild may exist (one such orphan was
-- found and hand-deleted in prod on 2026-07-28). Clear any orphans first
-- or ADD CONSTRAINT fails outright at deploy time.
DELETE FROM "reminders" WHERE "guildId" NOT IN (SELECT "discordId" FROM "guilds");

-- Guarded so the migration gate can replay this file against a database
-- where it already applied cleanly (ADD CONSTRAINT has no IF NOT EXISTS).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'reminders_guildId_fkey' AND conrelid = 'reminders'::regclass
    ) THEN
        ALTER TABLE "reminders" ADD CONSTRAINT "reminders_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("discordId") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- afk_statuses.guildId index declared in schema.prisma (@@index([guildId]))
-- but never created by the original migration (20260703051000_afk_status).
CREATE INDEX IF NOT EXISTS "afk_statuses_guildId_idx" ON "afk_statuses"("guildId");

-- Cosmetic index rename to match current naming convention. Guarded so a
-- replay after the rename already happened doesn't fail on the old name
-- no longer existing.
DO $$
BEGIN
    IF to_regclass('"GuildForumThread_guildId_threadId_key"') IS NOT NULL
        AND to_regclass('"guild_forum_threads_guildId_threadId_key"') IS NULL
    THEN
        ALTER INDEX "GuildForumThread_guildId_threadId_key" RENAME TO "guild_forum_threads_guildId_threadId_key";
    END IF;
END $$;
