-- Command event recording (#2391, obs P1). Additive only: one new table, three
-- indexes. No existing table or column is touched.

-- CreateTable
CREATE TABLE IF NOT EXISTS "command_events" (
    "id" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "guildId" TEXT,
    "userId" TEXT NOT NULL,
    "command" TEXT NOT NULL,
    "subcommand" TEXT,
    "kind" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "latencyMs" INTEGER NOT NULL,
    "errorClass" TEXT,
    "shardId" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "command_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "command_events_occurredAt_idx" ON "command_events"("occurredAt");
CREATE INDEX IF NOT EXISTS "command_events_guildId_occurredAt_idx" ON "command_events"("guildId", "occurredAt");
CREATE INDEX IF NOT EXISTS "command_events_command_occurredAt_idx" ON "command_events"("command", "occurredAt");
