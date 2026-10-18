-- Activation funnel events (onboarding delivery, station clicks, recap auto-enable).
-- Rows are pruned after 180 days by DatabaseService.cleanupOldData.
-- Additive only: one new table, two indexes. No existing table or column is touched.

-- CreateTable
CREATE TABLE IF NOT EXISTS "activation_events" (
    "id" SERIAL NOT NULL,
    "guildDiscordId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "reason" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activation_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "activation_events_kind_check" CHECK ("kind" IN ('onboarding_delivered', 'onboarding_failed', 'station_click', 'recap_auto_enabled'))
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "activation_events_kind_occurredAt_idx" ON "activation_events"("kind", "occurredAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "activation_events_guildDiscordId_idx" ON "activation_events"("guildDiscordId");

-- Enable RLS (default-deny, no policies; matches command_events and the baseline tables)
ALTER TABLE "public"."activation_events" ENABLE ROW LEVEL SECURITY;
