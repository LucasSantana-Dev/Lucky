-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AutoplayMode" AS ENUM ('similar', 'discover', 'popular');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "avatar" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "preferredVolume" INTEGER NOT NULL DEFAULT 50,
    "autoPlayEnabled" BOOLEAN NOT NULL DEFAULT true,
    "repeatMode" INTEGER NOT NULL DEFAULT 0,
    "shuffleEnabled" BOOLEAN NOT NULL DEFAULT false,
    "embedColor" TEXT DEFAULT '0x5865F2',
    "showLyrics" BOOLEAN NOT NULL DEFAULT true,
    "showThumbnails" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guilds" (
    "id" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guilds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guild_feature_toggles" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,

    CONSTRAINT "guild_feature_toggles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "twitch_notifications" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "twitchUserId" TEXT NOT NULL,
    "twitchLogin" TEXT NOT NULL,
    "discordChannelId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "twitch_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guild_settings" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "defaultVolume" INTEGER NOT NULL DEFAULT 50,
    "maxQueueSize" INTEGER NOT NULL DEFAULT 100,
    "autoPlayEnabled" BOOLEAN NOT NULL DEFAULT true,
    "autoplayMode" "AutoplayMode" NOT NULL DEFAULT 'similar',
    "autoplayGenres" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "repeatMode" INTEGER NOT NULL DEFAULT 0,
    "shuffleEnabled" BOOLEAN NOT NULL DEFAULT false,
    "prefix" TEXT DEFAULT '/',
    "embedColor" TEXT DEFAULT '0x5865F2',
    "language" TEXT NOT NULL DEFAULT 'en',
    "allowDownloads" BOOLEAN NOT NULL DEFAULT true,
    "allowPlaylists" BOOLEAN NOT NULL DEFAULT true,
    "allowSpotify" BOOLEAN NOT NULL DEFAULT true,
    "commandCooldown" INTEGER NOT NULL DEFAULT 3,
    "downloadCooldown" INTEGER NOT NULL DEFAULT 10,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guild_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guild_role_grants" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guild_role_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guild_automation_manifests" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "manifest" JSONB NOT NULL,
    "moduleOwnership" JSONB,
    "lastCapturedState" JSONB,
    "lastCapturedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guild_automation_manifests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guild_automation_runs" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "manifestId" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "operations" JSONB,
    "summary" JSONB,
    "protectedOperations" JSONB,
    "diagnostics" JSONB,
    "error" TEXT,
    "initiatedBy" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guild_automation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guild_automation_drifts" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "drift" JSONB NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'none',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guild_automation_drifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guild_sessions" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "currentTrack" JSONB,
    "queuePosition" INTEGER NOT NULL DEFAULT 0,
    "isPlaying" BOOLEAN NOT NULL DEFAULT false,
    "isPaused" BOOLEAN NOT NULL DEFAULT false,
    "volume" INTEGER NOT NULL DEFAULT 50,
    "repeatMode" INTEGER NOT NULL DEFAULT 0,
    "shuffleEnabled" BOOLEAN NOT NULL DEFAULT false,
    "queue" JSONB,
    "queueHistory" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guild_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "track_history" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "duration" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "thumbnail" TEXT,
    "source" TEXT NOT NULL,
    "playedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "playedBy" TEXT,
    "playDuration" INTEGER,
    "skipped" BOOLEAN NOT NULL DEFAULT false,
    "isAutoplay" BOOLEAN NOT NULL DEFAULT false,
    "isPlaylist" BOOLEAN NOT NULL DEFAULT false,
    "playlistName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "track_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "command_usage" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "guildId" TEXT,
    "command" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "errorCode" TEXT,
    "duration" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "command_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_limits" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "resetAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rate_limits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "downloads" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "quality" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "filename" TEXT,
    "fileSize" BIGINT,
    "filePath" TEXT,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "downloads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_artist_preferences" (
    "id" TEXT NOT NULL,
    "discordUserId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "artistKey" TEXT NOT NULL,
    "artistName" TEXT NOT NULL,
    "spotifyId" TEXT,
    "imageUrl" TEXT,
    "preference" TEXT NOT NULL DEFAULT 'prefer',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_artist_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recommendations" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "thumbnail" TEXT,
    "algorithm" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "reason" TEXT,
    "isAccepted" BOOLEAN,
    "isRejected" BOOLEAN,
    "feedback" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reaction_role_messages" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reaction_role_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reaction_role_mappings" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "emoji" TEXT,
    "buttonId" TEXT,
    "type" TEXT NOT NULL,
    "label" TEXT,
    "style" TEXT,

    CONSTRAINT "reaction_role_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lastfm_links" (
    "id" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "sessionKey" TEXT NOT NULL,
    "lastFmUsername" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lastfm_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spotify_links" (
    "id" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "spotifyId" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "spotifyUsername" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spotify_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_exclusions" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "excludedRoleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_exclusions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moderation_cases" (
    "id" TEXT NOT NULL,
    "caseNumber" INTEGER NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "username" TEXT NOT NULL DEFAULT 'Unknown',
    "moderatorId" TEXT NOT NULL,
    "moderatorName" TEXT NOT NULL DEFAULT 'Unknown',
    "type" TEXT NOT NULL,
    "reason" TEXT,
    "duration" INTEGER,
    "expiresAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "appealed" BOOLEAN NOT NULL DEFAULT false,
    "appealReason" TEXT,
    "appealReviewed" BOOLEAN NOT NULL DEFAULT false,
    "appealApproved" BOOLEAN NOT NULL DEFAULT false,
    "appealedAt" TIMESTAMP(3),
    "channelId" TEXT,
    "evidence" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "moderation_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moderation_settings" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "modLogChannelId" TEXT,
    "muteRoleId" TEXT,
    "modRoleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "adminRoleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "autoModEnabled" BOOLEAN NOT NULL DEFAULT false,
    "maxWarnings" INTEGER NOT NULL DEFAULT 3,
    "warningExpiry" INTEGER NOT NULL DEFAULT 2592000,
    "dmOnAction" BOOLEAN NOT NULL DEFAULT true,
    "requireReason" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "moderation_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automod_settings" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "spamEnabled" BOOLEAN NOT NULL DEFAULT false,
    "spamThreshold" INTEGER NOT NULL DEFAULT 5,
    "spamTimeWindow" INTEGER NOT NULL DEFAULT 5,
    "capsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "capsThreshold" INTEGER NOT NULL DEFAULT 70,
    "linksEnabled" BOOLEAN NOT NULL DEFAULT false,
    "allowedDomains" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "linkExemptChannels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "invitesEnabled" BOOLEAN NOT NULL DEFAULT false,
    "wordsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "bannedWords" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "exemptRoles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "exemptChannels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automod_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "embed_templates" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "color" TEXT,
    "footer" TEXT,
    "thumbnail" TEXT,
    "image" TEXT,
    "fields" JSONB,
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "embed_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auto_messages" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "channelId" TEXT,
    "message" TEXT,
    "embedId" TEXT,
    "embedData" JSONB,
    "trigger" TEXT,
    "exactMatch" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "cronSchedule" TEXT,
    "lastSent" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auto_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_commands" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "response" TEXT,
    "embedId" TEXT,
    "embedData" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsed" TIMESTAMP(3),
    "allowedRoles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "allowedChannels" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custom_commands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "server_logs" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "action" TEXT,
    "userId" TEXT,
    "channelId" TEXT,
    "moderatorId" TEXT,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "server_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "starboard_configs" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL DEFAULT '⭐',
    "threshold" INTEGER NOT NULL DEFAULT 3,
    "selfStar" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "starboard_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "starboard_entries" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "starboardMsgId" TEXT,
    "starCount" INTEGER NOT NULL DEFAULT 0,
    "content" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "starboard_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "level_configs" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "xpPerMessage" INTEGER NOT NULL DEFAULT 15,
    "xpCooldownMs" INTEGER NOT NULL DEFAULT 60000,
    "announceChannel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "level_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_xp" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 0,
    "lastXpAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "member_xp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "level_rewards" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "roleId" TEXT NOT NULL,

    CONSTRAINT "level_rewards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "live_boards" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "live_boards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auto_roles" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "delayMinutes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auto_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_birthdays" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "day" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "member_birthdays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guild_subscriptions" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "status" TEXT NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3),
    "priceId" TEXT,
    "canceledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guild_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stripe_webhook_events" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stripe_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_discordId_key" ON "users"("discordId");

-- CreateIndex
CREATE UNIQUE INDEX "user_preferences_userId_key" ON "user_preferences"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "guilds_discordId_key" ON "guilds"("discordId");

-- CreateIndex
CREATE INDEX "guild_feature_toggles_guildId_idx" ON "guild_feature_toggles"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "guild_feature_toggles_guildId_name_key" ON "guild_feature_toggles"("guildId", "name");

-- CreateIndex
CREATE INDEX "twitch_notifications_twitchUserId_idx" ON "twitch_notifications"("twitchUserId");

-- CreateIndex
CREATE UNIQUE INDEX "twitch_notifications_guildId_twitchUserId_key" ON "twitch_notifications"("guildId", "twitchUserId");

-- CreateIndex
CREATE UNIQUE INDEX "guild_settings_guildId_key" ON "guild_settings"("guildId");

-- CreateIndex
CREATE INDEX "guild_role_grants_guildId_idx" ON "guild_role_grants"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "guild_role_grants_guildId_roleId_module_key" ON "guild_role_grants"("guildId", "roleId", "module");

-- CreateIndex
CREATE UNIQUE INDEX "guild_automation_manifests_guildId_key" ON "guild_automation_manifests"("guildId");

-- CreateIndex
CREATE INDEX "guild_automation_manifests_guildId_idx" ON "guild_automation_manifests"("guildId");

-- CreateIndex
CREATE INDEX "guild_automation_runs_guildId_createdAt_idx" ON "guild_automation_runs"("guildId", "createdAt");

-- CreateIndex
CREATE INDEX "guild_automation_drifts_guildId_idx" ON "guild_automation_drifts"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "guild_automation_drifts_guildId_module_key" ON "guild_automation_drifts"("guildId", "module");

-- CreateIndex
CREATE INDEX "track_history_guildId_playedAt_idx" ON "track_history"("guildId", "playedAt");

-- CreateIndex
CREATE INDEX "track_history_trackId_idx" ON "track_history"("trackId");

-- CreateIndex
CREATE INDEX "command_usage_command_createdAt_idx" ON "command_usage"("command", "createdAt");

-- CreateIndex
CREATE INDEX "command_usage_guildId_createdAt_idx" ON "command_usage"("guildId", "createdAt");

-- CreateIndex
CREATE INDEX "rate_limits_resetAt_idx" ON "rate_limits"("resetAt");

-- CreateIndex
CREATE UNIQUE INDEX "rate_limits_key_key" ON "rate_limits"("key");

-- CreateIndex
CREATE INDEX "downloads_userId_createdAt_idx" ON "downloads"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "downloads_status_idx" ON "downloads"("status");

-- CreateIndex
CREATE INDEX "user_artist_preferences_discordUserId_guildId_idx" ON "user_artist_preferences"("discordUserId", "guildId");

-- CreateIndex
CREATE UNIQUE INDEX "user_artist_preferences_discordUserId_guildId_artistKey_key" ON "user_artist_preferences"("discordUserId", "guildId", "artistKey");

-- CreateIndex
CREATE INDEX "recommendations_guildId_createdAt_idx" ON "recommendations"("guildId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "reaction_role_messages_messageId_key" ON "reaction_role_messages"("messageId");

-- CreateIndex
CREATE INDEX "reaction_role_messages_guildId_idx" ON "reaction_role_messages"("guildId");

-- CreateIndex
CREATE INDEX "reaction_role_mappings_messageId_idx" ON "reaction_role_mappings"("messageId");

-- CreateIndex
CREATE UNIQUE INDEX "reaction_role_mappings_messageId_roleId_key" ON "reaction_role_mappings"("messageId", "roleId");

-- CreateIndex
CREATE UNIQUE INDEX "lastfm_links_discordId_key" ON "lastfm_links"("discordId");

-- CreateIndex
CREATE UNIQUE INDEX "spotify_links_discordId_key" ON "spotify_links"("discordId");

-- CreateIndex
CREATE INDEX "role_exclusions_guildId_idx" ON "role_exclusions"("guildId");

-- CreateIndex
CREATE INDEX "role_exclusions_roleId_idx" ON "role_exclusions"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "role_exclusions_guildId_roleId_excludedRoleId_key" ON "role_exclusions"("guildId", "roleId", "excludedRoleId");

-- CreateIndex
CREATE INDEX "moderation_cases_guildId_idx" ON "moderation_cases"("guildId");

-- CreateIndex
CREATE INDEX "moderation_cases_guildId_createdAt_idx" ON "moderation_cases"("guildId", "createdAt");

-- CreateIndex
CREATE INDEX "moderation_cases_userId_idx" ON "moderation_cases"("userId");

-- CreateIndex
CREATE INDEX "moderation_cases_moderatorId_idx" ON "moderation_cases"("moderatorId");

-- CreateIndex
CREATE UNIQUE INDEX "moderation_cases_guildId_caseNumber_key" ON "moderation_cases"("guildId", "caseNumber");

-- CreateIndex
CREATE UNIQUE INDEX "moderation_settings_guildId_key" ON "moderation_settings"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "automod_settings_guildId_key" ON "automod_settings"("guildId");

-- CreateIndex
CREATE INDEX "embed_templates_guildId_idx" ON "embed_templates"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "embed_templates_guildId_name_key" ON "embed_templates"("guildId", "name");

-- CreateIndex
CREATE INDEX "auto_messages_guildId_idx" ON "auto_messages"("guildId");

-- CreateIndex
CREATE INDEX "auto_messages_type_idx" ON "auto_messages"("type");

-- CreateIndex
CREATE INDEX "custom_commands_guildId_idx" ON "custom_commands"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "custom_commands_guildId_name_key" ON "custom_commands"("guildId", "name");

-- CreateIndex
CREATE INDEX "server_logs_guildId_idx" ON "server_logs"("guildId");

-- CreateIndex
CREATE INDEX "server_logs_type_idx" ON "server_logs"("type");

-- CreateIndex
CREATE INDEX "server_logs_userId_idx" ON "server_logs"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "starboard_configs_guildId_key" ON "starboard_configs"("guildId");

-- CreateIndex
CREATE INDEX "starboard_entries_guildId_idx" ON "starboard_entries"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "starboard_entries_guildId_messageId_key" ON "starboard_entries"("guildId", "messageId");

-- CreateIndex
CREATE UNIQUE INDEX "level_configs_guildId_key" ON "level_configs"("guildId");

-- CreateIndex
CREATE INDEX "member_xp_guildId_idx" ON "member_xp"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "member_xp_guildId_userId_key" ON "member_xp"("guildId", "userId");

-- CreateIndex
CREATE INDEX "level_rewards_guildId_idx" ON "level_rewards"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "level_rewards_guildId_level_key" ON "level_rewards"("guildId", "level");

-- CreateIndex
CREATE UNIQUE INDEX "live_boards_key_key" ON "live_boards"("key");

-- CreateIndex
CREATE INDEX "auto_roles_guildId_idx" ON "auto_roles"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "auto_roles_guildId_roleId_key" ON "auto_roles"("guildId", "roleId");

-- CreateIndex
CREATE INDEX "member_birthdays_guildId_month_day_idx" ON "member_birthdays"("guildId", "month", "day");

-- CreateIndex
CREATE UNIQUE INDEX "member_birthdays_guildId_userId_key" ON "member_birthdays"("guildId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "guild_subscriptions_guildId_key" ON "guild_subscriptions"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "guild_subscriptions_stripeSubscriptionId_key" ON "guild_subscriptions"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "guild_subscriptions_guildId_idx" ON "guild_subscriptions"("guildId");

-- CreateIndex
CREATE INDEX "guild_subscriptions_status_idx" ON "guild_subscriptions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "stripe_webhook_events_eventId_key" ON "stripe_webhook_events"("eventId");

-- CreateIndex
CREATE INDEX "stripe_webhook_events_type_createdAt_idx" ON "stripe_webhook_events"("type", "createdAt");

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_feature_toggles" ADD CONSTRAINT "guild_feature_toggles_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "twitch_notifications" ADD CONSTRAINT "twitch_notifications_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_settings" ADD CONSTRAINT "guild_settings_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guild_sessions" ADD CONSTRAINT "guild_sessions_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "track_history" ADD CONSTRAINT "track_history_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "command_usage" ADD CONSTRAINT "command_usage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "command_usage" ADD CONSTRAINT "command_usage_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reaction_role_mappings" ADD CONSTRAINT "reaction_role_mappings_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "reaction_role_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

