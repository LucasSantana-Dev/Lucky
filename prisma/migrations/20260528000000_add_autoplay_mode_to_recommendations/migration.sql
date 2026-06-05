-- Phase D prerequisite: record the active autoplay mode at recommendation pick time.
-- See GitHub issue #1081 and decisions/2026-05-21-autoplay-recommendation-roadmap.md
--
-- This allows future Phase D analysis to slice acceptance rate by mode (similar, discover, popular)
-- enabling mode-specific tuning of the candidate scoring logic.
--
-- The field is nullable to accommodate pre-migration rows (backfill not required);
-- forward writes will populate the mode for all three mode values.

ALTER TABLE "recommendations" ADD COLUMN "mode" TEXT;

-- Index for grouping/aggregating acceptance by mode and guild.
CREATE INDEX "recommendations_guildId_mode_createdAt_idx"
    ON "recommendations" ("guildId", "mode", "createdAt");
