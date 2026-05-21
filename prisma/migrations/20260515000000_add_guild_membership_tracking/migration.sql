-- Add bot join/leave timestamps to the existing guild row for cheap
-- current-state queries.
ALTER TABLE "guilds"
    ADD COLUMN "joinedAt" TIMESTAMP(3),
    ADD COLUMN "leftAt" TIMESTAMP(3);

-- Immutable audit trail of bot join/leave events per guild.
CREATE TYPE "GuildMembershipEventKind" AS ENUM ('JOIN', 'LEAVE');

CREATE TABLE "guild_membership_events" (
    "id" TEXT NOT NULL,
    "guildDiscordId" TEXT NOT NULL,
    "guildName" TEXT NOT NULL,
    "kind" "GuildMembershipEventKind" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "guild_membership_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "guild_membership_events_guildDiscordId_occurredAt_idx"
    ON "guild_membership_events" ("guildDiscordId", "occurredAt");

CREATE INDEX "guild_membership_events_occurredAt_idx"
    ON "guild_membership_events" ("occurredAt");
