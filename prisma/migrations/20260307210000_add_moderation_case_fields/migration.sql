-- AlterTable
ALTER TABLE "moderation_cases" ADD COLUMN "username" TEXT NOT NULL DEFAULT 'Unknown';
ALTER TABLE "moderation_cases" ADD COLUMN "moderatorName" TEXT NOT NULL DEFAULT 'Unknown';
ALTER TABLE "moderation_cases" ADD COLUMN "appealReviewed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "moderation_cases" ADD COLUMN "appealApproved" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "moderation_cases" ADD COLUMN "channelId" TEXT;
ALTER TABLE "moderation_cases" ADD COLUMN "evidence" TEXT[] DEFAULT ARRAY[]::TEXT[];
