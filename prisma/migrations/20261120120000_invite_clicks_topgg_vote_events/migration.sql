-- Invite clicks and top.gg vote history (obs P4, #2395).
-- Rows are pruned by DatabaseService.cleanupOldData: invite_clicks after 180
-- days, topgg_vote_events after 400 days.
-- Additive only: two new tables and their indexes. No existing table or column
-- is touched. Idempotent (IF NOT EXISTS), per the migration gate.

-- CreateTable
CREATE TABLE IF NOT EXISTS "invite_clicks" (
    "id" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmContent" TEXT,
    "referrerHost" TEXT,

    CONSTRAINT "invite_clicks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "topgg_vote_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "streak" INTEGER NOT NULL,
    "isWeekend" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "topgg_vote_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "invite_clicks_occurredAt_idx" ON "invite_clicks"("occurredAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "topgg_vote_events_occurredAt_idx" ON "topgg_vote_events"("occurredAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "topgg_vote_events_userId_occurredAt_idx" ON "topgg_vote_events"("userId", "occurredAt");

-- Enable RLS (default-deny, no policies; matches command_events and the baseline tables)
ALTER TABLE "public"."invite_clicks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."topgg_vote_events" ENABLE ROW LEVEL SECURITY;
