-- AlterTable: ModerationCase
ALTER TABLE "ModerationCase" ADD COLUMN IF NOT EXISTS "appealedAt" TIMESTAMP(3);

-- AlterTable: ModerationSettings
ALTER TABLE "ModerationSettings" ADD COLUMN IF NOT EXISTS "modRoleIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "ModerationSettings" ADD COLUMN IF NOT EXISTS "adminRoleIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable: AutoMessage
ALTER TABLE "AutoMessage" ADD COLUMN IF NOT EXISTS "embedData" JSONB;
ALTER TABLE "AutoMessage" ADD COLUMN IF NOT EXISTS "trigger" TEXT;
ALTER TABLE "AutoMessage" ADD COLUMN IF NOT EXISTS "exactMatch" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: CustomCommand
ALTER TABLE "CustomCommand" ADD COLUMN IF NOT EXISTS "description" TEXT;
ALTER TABLE "CustomCommand" ADD COLUMN IF NOT EXISTS "embedData" JSONB;
ALTER TABLE "CustomCommand" ADD COLUMN IF NOT EXISTS "lastUsed" TIMESTAMP(3);

-- AlterTable: ServerLog
ALTER TABLE "ServerLog" ADD COLUMN IF NOT EXISTS "action" TEXT;
