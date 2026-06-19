-- AlterTable
ALTER TABLE "mod_digest_config" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "twitch_follower_roles" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "twitchBroadcasterId" TEXT NOT NULL,
    "twitchBroadcasterLogin" TEXT NOT NULL,
    "discordRoleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "twitch_follower_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "twitch_follower_links" (
    "id" TEXT NOT NULL,
    "discordUserId" TEXT NOT NULL,
    "twitchUserId" TEXT NOT NULL,
    "twitchLogin" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "isFollower" BOOLEAN NOT NULL DEFAULT true,
    "isSubscriber" BOOLEAN NOT NULL DEFAULT false,
    "lastCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "twitch_follower_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "twitch_subscriber_roles" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "twitchBroadcasterId" TEXT NOT NULL,
    "twitchBroadcasterLogin" TEXT NOT NULL,
    "discordRoleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "twitch_subscriber_roles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "twitch_follower_roles_guildId_key" ON "twitch_follower_roles"("guildId");

-- CreateIndex
CREATE INDEX "twitch_follower_links_twitchUserId_guildId_idx" ON "twitch_follower_links"("twitchUserId", "guildId");

-- CreateIndex
CREATE INDEX "twitch_follower_links_guildId_idx" ON "twitch_follower_links"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "twitch_follower_links_discordUserId_guildId_key" ON "twitch_follower_links"("discordUserId", "guildId");

-- CreateIndex
CREATE UNIQUE INDEX "twitch_subscriber_roles_guildId_key" ON "twitch_subscriber_roles"("guildId");

-- AddForeignKey
ALTER TABLE "twitch_follower_roles" ADD CONSTRAINT "twitch_follower_roles_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("discordId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "twitch_follower_links" ADD CONSTRAINT "twitch_follower_links_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "twitch_follower_roles"("guildId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "twitch_subscriber_roles" ADD CONSTRAINT "twitch_subscriber_roles_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("discordId") ON DELETE CASCADE ON UPDATE CASCADE;
