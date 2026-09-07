-- CreateTable
CREATE TABLE IF NOT EXISTS "log_settings" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "ignoredChannelIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "ignoredRoleIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "ignoredUserIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "log_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "log_settings_guildId_key" ON "log_settings"("guildId");

-- Enable RLS
ALTER TABLE "public"."log_settings" ENABLE ROW LEVEL SECURITY;
