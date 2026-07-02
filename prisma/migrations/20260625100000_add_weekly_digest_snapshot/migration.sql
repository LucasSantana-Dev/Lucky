-- CreateTable for WeeklyDigestSnapshot
CREATE TABLE "weekly_digest_snapshots" (
    "id" SERIAL NOT NULL,
    "guildId" TEXT NOT NULL,
    "memberCount" INTEGER NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "weekly_digest_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex for weekly digest lookups by guild and date
CREATE INDEX "weekly_digest_snapshots_guildId_postedAt_idx" ON "weekly_digest_snapshots"("guildId", "postedAt");
