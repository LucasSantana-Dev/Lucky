-- Promote support_sessions.status from free TEXT ('open'|'closed') to a native
-- enum so a bad value can no longer evade the getExpired / getActiveForUser
-- filters (#1806). Existing values already match the enum members, so the
-- USING cast preserves all rows.
--
-- IDEMPOTENT / RE-RUNNABLE (#1837): prisma migrate deploy does NOT wrap a
-- migration file in a transaction (per-statement autocommit), so a mid-file
-- failure leaves earlier statements committed. This migration already
-- partial-applied against production twice before this rewrite. Every statement
-- below is therefore guarded so re-running against ANY partial state — enum
-- already created, CHECK already dropped, index already dropped, or none of
-- those — converges to the same final state instead of wedging. Verified on
-- postgres:18-alpine (prod parity) against clean + both partial states, each
-- run twice.

-- Drop the partial unique index BEFORE the type change. Its predicate compares
-- status to a text literal (WHERE "status" = 'open'), which Postgres re-validates
-- during ALTER COLUMN ... TYPE. Against the new enum type that becomes
-- `SupportSessionStatus = text` — an operator that does not exist — so the ALTER
-- fails with 42883 / P3018 unless the index is dropped first and recreated after.
-- (Migration-only object — partial indexes aren't expressible in schema.prisma,
-- so nothing else drops it for us.) The plain btree support_sessions_status_expiresAt_idx
-- is intentionally left alone: ALTER COLUMN ... TYPE rebuilds plain indexes
-- automatically; only the operator-dependent partial predicate needs handling.
-- IF EXISTS: it may already be gone from a prior partial run.
DROP INDEX IF EXISTS "support_sessions_one_open_per_user";

-- CreateEnum. CREATE TYPE has no IF NOT EXISTS; swallow duplicate_object so a
-- prior partial run that already created the enum is tolerated.
DO $$ BEGIN
  CREATE TYPE "SupportSessionStatus" AS ENUM ('open', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Drop the now-redundant TEXT CHECK constraint (added in the support_sessions
-- migration). The enum type enforces the same two values; keeping a
-- migration-only CHECK would drift and reject valid rows if the enum ever gains
-- a member. IF EXISTS: it may already be gone from a prior partial run.
ALTER TABLE "support_sessions" DROP CONSTRAINT IF EXISTS "support_sessions_status_check";

-- AlterTable
ALTER TABLE "support_sessions" ALTER COLUMN "status" DROP DEFAULT,
ALTER COLUMN "status" TYPE "SupportSessionStatus" USING ("status"::"SupportSessionStatus"),
ALTER COLUMN "status" SET DEFAULT 'open';

-- Recreate the partial unique index. The predicate now compares against the enum
-- ('open' is a valid SupportSessionStatus literal), so it is type-consistent.
-- Statement 1 dropped it, so a plain CREATE is safe on any re-run.
CREATE UNIQUE INDEX "support_sessions_one_open_per_user"
    ON "support_sessions"("guildId", "requestorId")
    WHERE "status" = 'open';
