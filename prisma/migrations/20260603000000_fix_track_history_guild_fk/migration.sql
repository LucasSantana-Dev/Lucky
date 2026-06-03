-- track_history.guildId has always held Discord snowflakes (queue.guild.id).
-- The FK was incorrectly pointed at guilds.id (CUID) instead of guilds.discordId.
-- This re-targets the constraint to the correct column with no data changes.
ALTER TABLE "track_history" DROP CONSTRAINT "track_history_guildId_fkey";
ALTER TABLE "track_history" ADD CONSTRAINT "track_history_guildId_fkey"
    FOREIGN KEY ("guildId") REFERENCES "guilds"("discordId")
    ON DELETE CASCADE ON UPDATE CASCADE;
