-- User feedback pipeline (#2477). Additive only: one new enum, one new table,
-- one index. No existing table or column is touched.

-- CreateEnum. CREATE TYPE has no IF NOT EXISTS; swallow duplicate_object so a
-- prior partial run that already created the enum is tolerated.
DO $$ BEGIN
  CREATE TYPE "FeedbackCategory" AS ENUM ('bug', 'idea', 'other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "user_feedback" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "category" "FeedbackCategory" NOT NULL,
    "text" TEXT NOT NULL,
    "context" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "user_feedback_guildId_idx" ON "user_feedback"("guildId");
CREATE INDEX IF NOT EXISTS "user_feedback_createdAt_idx" ON "user_feedback"("createdAt");
