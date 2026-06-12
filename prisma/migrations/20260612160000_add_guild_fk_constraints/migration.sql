-- Group A: Retarget 5 FKs from guilds(id) to guilds(discordId)

-- GuildFeatureToggle
DELETE FROM "guild_feature_toggles"
    WHERE "guildId" NOT IN (SELECT "discordId" FROM "guilds");
ALTER TABLE "guild_feature_toggles" DROP CONSTRAINT "guild_feature_toggles_guildId_fkey";
ALTER TABLE "guild_feature_toggles" ADD CONSTRAINT "guild_feature_toggles_guildId_fkey"
    FOREIGN KEY ("guildId") REFERENCES "guilds"("discordId")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- TwitchNotification
DELETE FROM "twitch_notifications"
    WHERE "guildId" NOT IN (SELECT "discordId" FROM "guilds");
ALTER TABLE "twitch_notifications" DROP CONSTRAINT "twitch_notifications_guildId_fkey";
ALTER TABLE "twitch_notifications" ADD CONSTRAINT "twitch_notifications_guildId_fkey"
    FOREIGN KEY ("guildId") REFERENCES "guilds"("discordId")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- GuildSettings
DELETE FROM "guild_settings"
    WHERE "guildId" NOT IN (SELECT "discordId" FROM "guilds");
ALTER TABLE "guild_settings" DROP CONSTRAINT "guild_settings_guildId_fkey";
ALTER TABLE "guild_settings" ADD CONSTRAINT "guild_settings_guildId_fkey"
    FOREIGN KEY ("guildId") REFERENCES "guilds"("discordId")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- GuildSession
DELETE FROM "guild_sessions"
    WHERE "guildId" NOT IN (SELECT "discordId" FROM "guilds");
ALTER TABLE "guild_sessions" DROP CONSTRAINT "guild_sessions_guildId_fkey";
ALTER TABLE "guild_sessions" ADD CONSTRAINT "guild_sessions_guildId_fkey"
    FOREIGN KEY ("guildId") REFERENCES "guilds"("discordId")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- CommandUsage (nullable, use SetNull)
UPDATE "command_usage" SET "guildId" = NULL
    WHERE "guildId" IS NOT NULL AND "guildId" NOT IN (SELECT "discordId" FROM "guilds");
ALTER TABLE "command_usage" DROP CONSTRAINT "command_usage_guildId_fkey";
ALTER TABLE "command_usage" ADD CONSTRAINT "command_usage_guildId_fkey"
    FOREIGN KEY ("guildId") REFERENCES "guilds"("discordId")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Group B: Add missing FKs to 20 models (all use Cascade)

-- GuildRoleGrant
DELETE FROM "guild_role_grants"
    WHERE "guildId" NOT IN (SELECT "discordId" FROM "guilds");
ALTER TABLE "guild_role_grants" ADD CONSTRAINT "guild_role_grants_guildId_fkey"
    FOREIGN KEY ("guildId") REFERENCES "guilds"("discordId")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- GuildAutomationManifest
DELETE FROM "guild_automation_manifests"
    WHERE "guildId" NOT IN (SELECT "discordId" FROM "guilds");
ALTER TABLE "guild_automation_manifests" ADD CONSTRAINT "guild_automation_manifests_guildId_fkey"
    FOREIGN KEY ("guildId") REFERENCES "guilds"("discordId")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- GuildAutomationRun
DELETE FROM "guild_automation_runs"
    WHERE "guildId" NOT IN (SELECT "discordId" FROM "guilds");
ALTER TABLE "guild_automation_runs" ADD CONSTRAINT "guild_automation_runs_guildId_fkey"
    FOREIGN KEY ("guildId") REFERENCES "guilds"("discordId")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- GuildAutomationDrift
DELETE FROM "guild_automation_drifts"
    WHERE "guildId" NOT IN (SELECT "discordId" FROM "guilds");
ALTER TABLE "guild_automation_drifts" ADD CONSTRAINT "guild_automation_drifts_guildId_fkey"
    FOREIGN KEY ("guildId") REFERENCES "guilds"("discordId")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Download
DELETE FROM "downloads"
    WHERE "guildId" NOT IN (SELECT "discordId" FROM "guilds");
ALTER TABLE "downloads" ADD CONSTRAINT "downloads_guildId_fkey"
    FOREIGN KEY ("guildId") REFERENCES "guilds"("discordId")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- RoleExclusion
DELETE FROM "role_exclusions"
    WHERE "guildId" NOT IN (SELECT "discordId" FROM "guilds");
ALTER TABLE "role_exclusions" ADD CONSTRAINT "role_exclusions_guildId_fkey"
    FOREIGN KEY ("guildId") REFERENCES "guilds"("discordId")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ModerationCase
DELETE FROM "moderation_cases"
    WHERE "guildId" NOT IN (SELECT "discordId" FROM "guilds");
ALTER TABLE "moderation_cases" ADD CONSTRAINT "moderation_cases_guildId_fkey"
    FOREIGN KEY ("guildId") REFERENCES "guilds"("discordId")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ModerationSettings
DELETE FROM "moderation_settings"
    WHERE "guildId" NOT IN (SELECT "discordId" FROM "guilds");
ALTER TABLE "moderation_settings" ADD CONSTRAINT "moderation_settings_guildId_fkey"
    FOREIGN KEY ("guildId") REFERENCES "guilds"("discordId")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AutoModSettings
DELETE FROM "automod_settings"
    WHERE "guildId" NOT IN (SELECT "discordId" FROM "guilds");
ALTER TABLE "automod_settings" ADD CONSTRAINT "automod_settings_guildId_fkey"
    FOREIGN KEY ("guildId") REFERENCES "guilds"("discordId")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- EmbedTemplate
DELETE FROM "embed_templates"
    WHERE "guildId" NOT IN (SELECT "discordId" FROM "guilds");
ALTER TABLE "embed_templates" ADD CONSTRAINT "embed_templates_guildId_fkey"
    FOREIGN KEY ("guildId") REFERENCES "guilds"("discordId")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AutoMessage
DELETE FROM "auto_messages"
    WHERE "guildId" NOT IN (SELECT "discordId" FROM "guilds");
ALTER TABLE "auto_messages" ADD CONSTRAINT "auto_messages_guildId_fkey"
    FOREIGN KEY ("guildId") REFERENCES "guilds"("discordId")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- CustomCommand
DELETE FROM "custom_commands"
    WHERE "guildId" NOT IN (SELECT "discordId" FROM "guilds");
ALTER TABLE "custom_commands" ADD CONSTRAINT "custom_commands_guildId_fkey"
    FOREIGN KEY ("guildId") REFERENCES "guilds"("discordId")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ServerLog
DELETE FROM "server_logs"
    WHERE "guildId" NOT IN (SELECT "discordId" FROM "guilds");
ALTER TABLE "server_logs" ADD CONSTRAINT "server_logs_guildId_fkey"
    FOREIGN KEY ("guildId") REFERENCES "guilds"("discordId")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- StarboardEntry
DELETE FROM "starboard_entries"
    WHERE "guildId" NOT IN (SELECT "discordId" FROM "guilds");
ALTER TABLE "starboard_entries" ADD CONSTRAINT "starboard_entries_guildId_fkey"
    FOREIGN KEY ("guildId") REFERENCES "guilds"("discordId")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- LevelConfig
DELETE FROM "level_configs"
    WHERE "guildId" NOT IN (SELECT "discordId" FROM "guilds");
ALTER TABLE "level_configs" ADD CONSTRAINT "level_configs_guildId_fkey"
    FOREIGN KEY ("guildId") REFERENCES "guilds"("discordId")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- MemberXP
DELETE FROM "member_xp"
    WHERE "guildId" NOT IN (SELECT "discordId" FROM "guilds");
ALTER TABLE "member_xp" ADD CONSTRAINT "member_xp_guildId_fkey"
    FOREIGN KEY ("guildId") REFERENCES "guilds"("discordId")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- LevelReward
DELETE FROM "level_rewards"
    WHERE "guildId" NOT IN (SELECT "discordId" FROM "guilds");
ALTER TABLE "level_rewards" ADD CONSTRAINT "level_rewards_guildId_fkey"
    FOREIGN KEY ("guildId") REFERENCES "guilds"("discordId")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- AutoRole
DELETE FROM "auto_roles"
    WHERE "guildId" NOT IN (SELECT "discordId" FROM "guilds");
ALTER TABLE "auto_roles" ADD CONSTRAINT "auto_roles_guildId_fkey"
    FOREIGN KEY ("guildId") REFERENCES "guilds"("discordId")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- MemberBirthday
DELETE FROM "member_birthdays"
    WHERE "guildId" NOT IN (SELECT "discordId" FROM "guilds");
ALTER TABLE "member_birthdays" ADD CONSTRAINT "member_birthdays_guildId_fkey"
    FOREIGN KEY ("guildId") REFERENCES "guilds"("discordId")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- GuildSubscription
DELETE FROM "guild_subscriptions"
    WHERE "guildId" NOT IN (SELECT "discordId" FROM "guilds");
ALTER TABLE "guild_subscriptions" ADD CONSTRAINT "guild_subscriptions_guildId_fkey"
    FOREIGN KEY ("guildId") REFERENCES "guilds"("discordId")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ReactionRoleMessage
DELETE FROM "reaction_role_messages"
    WHERE "guildId" NOT IN (SELECT "discordId" FROM "guilds");
ALTER TABLE "reaction_role_messages" ADD CONSTRAINT "reaction_role_messages_guildId_fkey"
    FOREIGN KEY ("guildId") REFERENCES "guilds"("discordId")
    ON DELETE CASCADE ON UPDATE CASCADE;
