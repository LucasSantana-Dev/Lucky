-- Add the LASTFM_PROFILE value to the RecommendationSource enum.
--
-- Autoplay tagged every Last.fm profile hit (loved, top and recent tracks)
-- as LASTFM_LOVED. Top and recent seeds now get their own value so per-source
-- acceptance telemetry measures true loved tracks separately (#2956).
--
-- Positioned after LASTFM_LOVED to mirror the in-code union order in
-- packages/bot/src/services/musicRecommendation/autoplay/recommendationBasis.ts.
ALTER TYPE "RecommendationSource" ADD VALUE IF NOT EXISTS 'LASTFM_PROFILE' AFTER 'LASTFM_LOVED';
