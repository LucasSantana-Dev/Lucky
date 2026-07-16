-- Promote support_sessions.status from free TEXT ('open'|'closed') to a native
-- enum so a bad value can no longer evade the getExpired / getActiveForUser
-- filters (#1806). Existing values already match the enum members, so the
-- USING cast preserves all rows.

-- Drop the partial unique index BEFORE the type change. Its predicate compares
-- status to a text literal (WHERE "status" = 'open'), which Postgres re-validates
-- during ALTER COLUMN ... TYPE. Against the new enum type that becomes
-- `SupportSessionStatus = text` — an operator that does not exist — so the ALTER
-- fails with 42883 / P3018 unless the index is dropped first and recreated after.
-- (This index is migration-only — partial indexes aren't expressible in
-- schema.prisma — so nothing else drops it for us. #1837)
DROP INDEX "support_sessions_one_open_per_user";

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

-- Recreate the partial unique index. The predicate now compares against the enum
-- ('open' is a valid SupportSessionStatus literal), so it is type-consistent.
CREATE UNIQUE INDEX "support_sessions_one_open_per_user"
    ON "support_sessions"("guildId", "requestorId")
    WHERE "status" = 'open';
