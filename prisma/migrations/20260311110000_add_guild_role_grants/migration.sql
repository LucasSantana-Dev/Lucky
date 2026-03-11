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

CREATE UNIQUE INDEX "guild_role_grants_guildId_roleId_module_key"
ON "guild_role_grants"("guildId", "roleId", "module");

CREATE INDEX "guild_role_grants_guildId_idx"
ON "guild_role_grants"("guildId");
