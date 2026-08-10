/*
  Warnings:

  - You are about to drop the column `allowDownloads` on the `guild_settings` table. All the data in the column will be lost.
  - You are about to drop the column `downloadCooldown` on the `guild_settings` table. All the data in the column will be lost.
  - You are about to drop the `downloads` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "downloads" DROP CONSTRAINT "downloads_guildId_fkey";

-- AlterTable
ALTER TABLE "guild_settings" DROP COLUMN "allowDownloads",
DROP COLUMN "downloadCooldown";

-- DropTable
DROP TABLE "downloads";
