-- #2738: recap opt-out. Nullable, so existing rows stay undecided; IF NOT
-- EXISTS keeps the migration re-runnable for the Migration Gate.
ALTER TABLE "guild_settings" ADD COLUMN IF NOT EXISTS "recapDecidedAt" TIMESTAMP(3);
