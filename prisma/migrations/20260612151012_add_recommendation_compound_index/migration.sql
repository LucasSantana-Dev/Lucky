-- Add compound index on (guildId, discordUserId, trackId) to support
-- deduplication queries for event-log semantics in recommendation tracking.
-- This index allows efficient identification of duplicate recommendation
-- events without enforcing uniqueness (multiple recommendations of the same
-- track to the same user over time are intentional and tracked separately).
-- See issue #1194 for decision on event-log vs. uniqueness trade-off.

CREATE INDEX "recommendations_guildId_discordUserId_trackId_idx"
  ON "recommendations"("guildId", "discordUserId", "trackId");
