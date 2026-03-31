-- AlterTable
ALTER TABLE "automod_settings" ADD COLUMN "linkExemptChannels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
