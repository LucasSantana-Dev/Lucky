-- Add blockSertanejo toggle to GuildSettings (defaults to true to preserve existing veto behavior)
ALTER TABLE "guild_settings" ADD COLUMN "blockSertanejo" BOOLEAN NOT NULL DEFAULT true;
