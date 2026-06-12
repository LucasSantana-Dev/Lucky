-- AlterTable: client-generated dedup key for support-report intake (#1319).
-- Nullable + unique: NULLs don't collide in Postgres, so reports without a
-- key (older clients, bot surface) are unaffected.
ALTER TABLE "support_reports" ADD COLUMN "submissionKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "support_reports_submissionKey_key" ON "support_reports"("submissionKey");
