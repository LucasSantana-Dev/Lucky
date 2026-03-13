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

CREATE UNIQUE INDEX "guild_automation_manifests_guildId_key"
ON "guild_automation_manifests"("guildId");

CREATE INDEX "guild_automation_manifests_guildId_idx"
ON "guild_automation_manifests"("guildId");

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

CREATE INDEX "guild_automation_runs_guildId_createdAt_idx"
ON "guild_automation_runs"("guildId", "createdAt");

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

CREATE UNIQUE INDEX "guild_automation_drifts_guildId_module_key"
ON "guild_automation_drifts"("guildId", "module");

CREATE INDEX "guild_automation_drifts_guildId_idx"
ON "guild_automation_drifts"("guildId");
