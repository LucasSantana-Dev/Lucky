-- CreateTable support_reports
CREATE TABLE "support_reports" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "context" TEXT NOT NULL,
    "image" BYTEA,
    "imageMimeType" TEXT,
    "correlationId" TEXT,
    "guildId" TEXT,
    "surface" TEXT NOT NULL,
    "errorCategory" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "rateLimitKey" TEXT,

    CONSTRAINT "support_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "support_reports_correlationId_idx" ON "support_reports"("correlationId");

-- CreateIndex
CREATE INDEX "support_reports_guildId_idx" ON "support_reports"("guildId");

-- CreateIndex
CREATE INDEX "support_reports_createdAt_idx" ON "support_reports"("createdAt");

-- CreateIndex
CREATE INDEX "support_reports_status_idx" ON "support_reports"("status");
