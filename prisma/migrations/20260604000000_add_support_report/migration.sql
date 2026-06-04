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

-- CreateIndex: status-filtered listing ordered by createdAt
CREATE INDEX "support_reports_status_createdAt_idx" ON "support_reports"("status", "createdAt");

-- Defense-in-depth DB constraints (the app validation layer is the primary gate).
-- Cap stored image bytes at the documented 5 MB limit.
ALTER TABLE "support_reports"
    ADD CONSTRAINT "support_reports_image_size_check"
    CHECK ("image" IS NULL OR octet_length("image") <= 5242880);

-- Keep image bytes and their MIME type consistent: both present or both absent.
ALTER TABLE "support_reports"
    ADD CONSTRAINT "support_reports_image_mimetype_pair_check"
    CHECK (("image" IS NULL) = ("imageMimeType" IS NULL));

-- Restrict image MIME type to the supported allowlist.
ALTER TABLE "support_reports"
    ADD CONSTRAINT "support_reports_image_mimetype_allowlist_check"
    CHECK ("imageMimeType" IS NULL OR "imageMimeType" IN ('image/png', 'image/jpeg', 'image/webp'));

-- Constrain the finite state fields to their allowed values.
ALTER TABLE "support_reports"
    ADD CONSTRAINT "support_reports_surface_check"
    CHECK ("surface" IN ('bot', 'web'));

ALTER TABLE "support_reports"
    ADD CONSTRAINT "support_reports_status_check"
    CHECK ("status" IN ('new', 'triaged', 'promoted', 'dismissed'));
