-- Add CHECK constraints to guild_settings numeric columns
-- These constraints match app-layer validation enforced in bot commands and backend routes

-- Default volume (0-200): Playback volume from volume.ts validation (1-200),
-- with 0 allowed for safety margin. Default: 50
ALTER TABLE "guild_settings"
ADD CONSTRAINT "guild_settings_defaultVolume_bounds"
CHECK ("defaultVolume" >= 0 AND "defaultVolume" <= 200);

-- Max queue size (1-1000): Reasonable limit for queue management.
-- Default: 100. Must be at least 1 to allow queuing.
ALTER TABLE "guild_settings"
ADD CONSTRAINT "guild_settings_maxQueueSize_bounds"
CHECK ("maxQueueSize" >= 1 AND "maxQueueSize" <= 1000);

-- Command cooldown (0-300 seconds): 0 disables, 300 = 5 minutes max.
-- Default: 3 seconds
ALTER TABLE "guild_settings"
ADD CONSTRAINT "guild_settings_commandCooldown_bounds"
CHECK ("commandCooldown" >= 0 AND "commandCooldown" <= 300);

-- Download cooldown (0-3600 seconds): 0 disables, 3600 = 60 minutes max.
-- Default: 10 seconds
ALTER TABLE "guild_settings"
ADD CONSTRAINT "guild_settings_downloadCooldown_bounds"
CHECK ("downloadCooldown" >= 0 AND "downloadCooldown" <= 3600);

-- Repeat mode (0-2): Enum-like field: 0 = off, 1 = queue, 2 = track.
-- Default: 0
ALTER TABLE "guild_settings"
ADD CONSTRAINT "guild_settings_repeatMode_bounds"
CHECK ("repeatMode" >= 0 AND "repeatMode" <= 2);

-- Idle timeout minutes (NULL or 0-60): Optional field.
-- 0 = disabled, max 60 minutes before auto-disconnect. Default: 0.
-- NULL is allowed; CHECK passes on NULL in PostgreSQL.
ALTER TABLE "guild_settings"
ADD CONSTRAINT "guild_settings_idleTimeoutMinutes_bounds"
CHECK ("idleTimeoutMinutes" IS NULL OR ("idleTimeoutMinutes" >= 0 AND "idleTimeoutMinutes" <= 60));

-- Vote skip threshold (NULL or 0-100): Optional percentage field.
-- Must be 0-100 as a percentage. voteskip.ts uses: Math.ceil((count * threshold) / 100).
-- Default when present: 50.
-- NULL is allowed; CHECK passes on NULL in PostgreSQL.
ALTER TABLE "guild_settings"
ADD CONSTRAINT "guild_settings_voteSkipThreshold_bounds"
CHECK ("voteSkipThreshold" IS NULL OR ("voteSkipThreshold" >= 0 AND "voteSkipThreshold" <= 100));
