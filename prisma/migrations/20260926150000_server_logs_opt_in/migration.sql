-- SERVER_LOGS is now a per-guild opt-in (default off, #2370). Keep logging on
-- for guilds that already configured a mod-log channel or log ignore rules.
INSERT INTO "guild_feature_toggles" ("id", "guildId", "name", "enabled")
SELECT gen_random_uuid()::text, g."discordId", 'SERVER_LOGS', true
FROM "guilds" g
WHERE g."leftAt" IS NULL
  AND (
    EXISTS (
      SELECT 1 FROM "moderation_settings" m
      WHERE m."guildId" = g."discordId" AND m."modLogChannelId" IS NOT NULL
    )
    OR EXISTS (
      SELECT 1 FROM "log_settings" l WHERE l."guildId" = g."discordId"
    )
  )
ON CONFLICT ("guildId", "name") DO NOTHING;
