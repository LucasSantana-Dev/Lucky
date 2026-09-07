-- AlterTable
ALTER TABLE "channel_cleanup_configs"
ADD COLUMN IF NOT EXISTS "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS "lastError" TEXT;
