-- AlterTable: broadcast reminders (#1767)
ALTER TABLE "reminders" ADD COLUMN "targetType" TEXT NOT NULL DEFAULT 'user';
ALTER TABLE "reminders" ADD COLUMN "roleId" TEXT;
ALTER TABLE "reminders" ADD COLUMN "deliveryFailed" BOOLEAN NOT NULL DEFAULT false;

-- Constrain the finite target type. (Not expressible in schema.prisma;
-- migration-only, no CI drift check runs.)
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_targetType_check" CHECK ("targetType" IN ('user', 'channel', 'role'));
