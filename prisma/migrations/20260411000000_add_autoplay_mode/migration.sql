-- CreateEnum
CREATE TYPE "AutoplayMode" AS ENUM ('similar', 'discover', 'popular');

-- AlterTable
ALTER TABLE "guild_settings" ADD COLUMN "autoplayMode" "AutoplayMode" NOT NULL DEFAULT 'similar';
