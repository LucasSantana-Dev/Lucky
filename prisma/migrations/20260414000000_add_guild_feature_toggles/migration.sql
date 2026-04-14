-- CreateTable
CREATE TABLE "guild_feature_toggles" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,

    CONSTRAINT "guild_feature_toggles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "guild_feature_toggles_guildId_idx" ON "guild_feature_toggles"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "guild_feature_toggles_guildId_name_key" ON "guild_feature_toggles"("guildId", "name");

-- AddForeignKey
ALTER TABLE "guild_feature_toggles" ADD CONSTRAINT "guild_feature_toggles_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
