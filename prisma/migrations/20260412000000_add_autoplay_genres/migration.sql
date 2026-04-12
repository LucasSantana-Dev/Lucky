-- Add autoplayGenres field to guild_settings
ALTER TABLE "guild_settings" ADD COLUMN IF NOT EXISTS "autoplayGenres" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
