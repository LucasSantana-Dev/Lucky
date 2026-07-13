-- Promote support_sessions.status from free TEXT ('open'|'closed') to a native
-- enum so a bad value can no longer evade the getExpired / getActiveForUser
-- filters (#1806). Existing values already match the enum members, so the
-- USING cast preserves all rows.

-- CreateEnum
CREATE TYPE "SupportSessionStatus" AS ENUM ('open', 'closed');

-- Drop the now-redundant TEXT CHECK constraint (added in the support_sessions
-- migration). The enum type enforces the same two values; keeping a
-- migration-only CHECK would drift and reject valid rows if the enum ever gains
-- a member. Dropped before the type change so it isn't re-validated against the
-- new enum type.
ALTER TABLE "support_sessions" DROP CONSTRAINT "support_sessions_status_check";

-- AlterTable
ALTER TABLE "support_sessions" ALTER COLUMN "status" DROP DEFAULT,
ALTER COLUMN "status" TYPE "SupportSessionStatus" USING ("status"::"SupportSessionStatus"),
ALTER COLUMN "status" SET DEFAULT 'open';
