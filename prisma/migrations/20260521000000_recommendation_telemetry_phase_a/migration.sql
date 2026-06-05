-- Phase A of the autoplay recommendation telemetry roadmap.
-- See decisions/2026-05-21-autoplay-recommendation-roadmap.md
--
-- The `recommendations` table was previously unused scaffolding — no service
-- writes to it. This migration repurposes the table for autoplay closed-loop
-- telemetry without preserving the legacy `algorithm` column (no production
-- rows depend on it).

-- New enum captures the in-code RecommendationSource union from
-- packages/bot/src/utils/music/autoplay/recommendationBasis.ts.
CREATE TYPE "RecommendationSource" AS ENUM (
    'SPOTIFY_REC',
    'SPOTIFY_TASTE',
    'LASTFM_LOVED',
    'LASTFM_SIMILAR',
    'LASTFM_GENRE_FALLBACK',
    'ARTIST_FALLBACK',
    'GENRE_TAG'
);

-- Drop the unused legacy column. Safe: no writer in the codebase, no rows.
ALTER TABLE "recommendations" DROP COLUMN "algorithm";

-- Make `confidence` nullable. Phase D may populate it; Phase A/B do not need
-- it and forcing a default would lie about the data.
ALTER TABLE "recommendations" ALTER COLUMN "confidence" DROP NOT NULL;

-- Per-user telemetry: the Discord user whose listening session produced the
-- pick. Optional because some autoplay paths choose a VC contributor instead
-- of a single requester (see vcWeights.ts).
ALTER TABLE "recommendations" ADD COLUMN "discordUserId" TEXT;

-- New structured columns. `source` and `signals` are the load-bearing pair
-- for Phase C aggregations. `reason` stays as the human-readable
-- serialization (denormalized convenience, kept in sync at write time).
ALTER TABLE "recommendations" ADD COLUMN "source" "RecommendationSource";
ALTER TABLE "recommendations" ADD COLUMN "signals" JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Aggregation index for `/recommendations history` per-source rollups.
CREATE INDEX "recommendations_guildId_source_createdAt_idx"
    ON "recommendations" ("guildId", "source", "createdAt");
