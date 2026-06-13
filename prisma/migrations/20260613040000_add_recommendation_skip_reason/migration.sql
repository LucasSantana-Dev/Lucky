-- Capture an optional skip reason on a recommendation, set via emoji reaction
-- on the now-playing control. Nullable: absence means no reason was given.
ALTER TABLE "recommendations" ADD COLUMN "skipReason" TEXT;
