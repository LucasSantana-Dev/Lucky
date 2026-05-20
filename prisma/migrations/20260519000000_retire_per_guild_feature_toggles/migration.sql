-- Retire per-guild feature toggles.
--
-- The application path for per-guild feature toggles was removed in PR #801
-- (admin panel for writable global toggles). This migration cleans up the
-- orphan table left behind.
--
-- See docs/decisions/2026-05-19-retire-per-guild-feature-toggles.md.

DROP TABLE IF EXISTS "guild_feature_toggles";
