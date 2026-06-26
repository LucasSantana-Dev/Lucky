-- CreateTable
CREATE TABLE "batch_jobs" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "jobType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "initiatedBy" TEXT NOT NULL,
    "sourceChannelId" TEXT,
    "targetChannelId" TEXT,
    "scope" JSONB NOT NULL,
    "options" JSONB,
    "totalItems" INTEGER NOT NULL DEFAULT 0,
    "processedItems" INTEGER NOT NULL DEFAULT 0,
    "failedItems" INTEGER NOT NULL DEFAULT 0,
    "skippedItems" INTEGER NOT NULL DEFAULT 0,
    "estimatedMinutes" INTEGER,
    "nextCursor" TEXT,
    "checkpointState" JSONB,
    "summary" JSONB,
    "errorLog" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "lastProgressAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "batch_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batch_job_items" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "attemptedAt" TIMESTAMP(3),
    "resultMetadata" JSONB,

    CONSTRAINT "batch_job_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "batch_jobs_guildId_status_createdAt_idx" ON "batch_jobs"("guildId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "batch_jobs_status_idx" ON "batch_jobs"("status");

-- CreateIndex
CREATE INDEX "batch_jobs_initiatedBy_idx" ON "batch_jobs"("initiatedBy");

-- CreateIndex
CREATE INDEX "batch_job_items_jobId_status_idx" ON "batch_job_items"("jobId", "status");

-- CreateIndex
CREATE INDEX "batch_job_items_jobId_attemptedAt_idx" ON "batch_job_items"("jobId", "attemptedAt");

-- AddForeignKey
ALTER TABLE "batch_jobs" ADD CONSTRAINT "batch_jobs_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "guilds"("discordId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_job_items" ADD CONSTRAINT "batch_job_items_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "batch_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
