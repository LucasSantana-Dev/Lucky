-- Comeback card: when an opted-in guild has a quiet week after an active
-- month, the recap scheduler posts one short reminder with the mix button.
-- This stamps the last one so a guild gets at most one per 28 days.
-- Additive column, null for every existing guild.
ALTER TABLE "guild_settings" ADD COLUMN IF NOT EXISTS "recapComebackAt" TIMESTAMP(3);
