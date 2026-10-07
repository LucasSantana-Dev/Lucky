-- #2678: weekly recap opt-in. Both columns nullable; IF NOT EXISTS keeps the
-- migration re-runnable for the Migration Gate.
ALTER TABLE "guild_settings" ADD COLUMN IF NOT EXISTS "recapChannelId" TEXT;
ALTER TABLE "guild_settings" ADD COLUMN IF NOT EXISTS "recapLastPostedAt" TIMESTAMP(3);
