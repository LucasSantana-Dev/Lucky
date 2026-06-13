-- Capture an optional skip reason on a recommendation, set via emoji reaction
-- on the now-playing control. Nullable: absence means no reason was given.
-- Supported values: generic_dislike, too_chill, mood_mismatch, repeat.
CREATE TYPE "SkipReason" AS ENUM (
    'generic_dislike',
    'too_chill',
    'mood_mismatch',
    'repeat'
);

ALTER TABLE "recommendations" ADD COLUMN "skipReason" "SkipReason";
