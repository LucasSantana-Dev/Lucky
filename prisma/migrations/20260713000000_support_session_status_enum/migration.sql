-- Promote support_sessions.status from free TEXT ('open'|'closed') to a native
-- enum so a bad value can no longer evade the getExpired / getActiveForUser
-- filters (#1806). Existing values already match the enum members, so the
-- USING cast preserves all rows.

-- CreateEnum
CREATE TYPE "SupportSessionStatus" AS ENUM ('open', 'closed');

-- AlterTable
ALTER TABLE "support_sessions" ALTER COLUMN "status" DROP DEFAULT,
ALTER COLUMN "status" TYPE "SupportSessionStatus" USING ("status"::"SupportSessionStatus"),
ALTER COLUMN "status" SET DEFAULT 'open';
