-- music_session_snapshots.guildId, guild_counters.guildId, and named_queues.guildId
-- have always held Discord snowflakes (queue.guild.id), but their FKs were
-- pointed at guilds.id (CUID) instead of guilds.discordId — so every write
-- failed with P2003 (foreign key violation). This is the same defect already
-- fixed for track_history in 20260603000000_fix_track_history_guild_fk; here we
-- re-target the three remaining music FKs to the correct column.
--
-- Because the writes were failing, these tables should hold no CUID-keyed rows.
-- The pre-emptive DELETE removes any row whose guildId is not a real Discord
-- guild id (such rows cannot satisfy the new FK and would only block its
-- creation); it is a no-op on the expected empty/consistent tables.

DELETE FROM "music_session_snapshots"
    WHERE "guildId" NOT IN (SELECT "discordId" FROM "guilds");
ALTER TABLE "music_session_snapshots" DROP CONSTRAINT "music_session_snapshots_guildId_fkey";
ALTER TABLE "music_session_snapshots" ADD CONSTRAINT "music_session_snapshots_guildId_fkey"
    FOREIGN KEY ("guildId") REFERENCES "guilds"("discordId")
    ON DELETE CASCADE ON UPDATE CASCADE;

DELETE FROM "guild_counters"
    WHERE "guildId" NOT IN (SELECT "discordId" FROM "guilds");
ALTER TABLE "guild_counters" DROP CONSTRAINT "guild_counters_guildId_fkey";
ALTER TABLE "guild_counters" ADD CONSTRAINT "guild_counters_guildId_fkey"
    FOREIGN KEY ("guildId") REFERENCES "guilds"("discordId")
    ON DELETE CASCADE ON UPDATE CASCADE;

DELETE FROM "named_queues"
    WHERE "guildId" NOT IN (SELECT "discordId" FROM "guilds");
ALTER TABLE "named_queues" DROP CONSTRAINT "named_queues_guildId_fkey";
ALTER TABLE "named_queues" ADD CONSTRAINT "named_queues_guildId_fkey"
    FOREIGN KEY ("guildId") REFERENCES "guilds"("discordId")
    ON DELETE CASCADE ON UPDATE CASCADE;
