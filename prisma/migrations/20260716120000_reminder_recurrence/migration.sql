-- Add recurring-reminder support (#1837 feature): an RFC-5545 RRULE string plus
-- an IANA timezone. Both nullable — NULL recurrenceRule = one-time (existing
-- behaviour unchanged). Additive columns only, non-destructive.
--
-- Idempotent per decisions/2026-07-16-idempotent-migrations.md: ADD COLUMN
-- IF NOT EXISTS so a re-run after a partial-apply (prisma migrate deploy is
-- non-transactional) converges instead of erroring "column already exists".
ALTER TABLE "reminders" ADD COLUMN IF NOT EXISTS "recurrenceRule" TEXT;
ALTER TABLE "reminders" ADD COLUMN IF NOT EXISTS "timezone" TEXT;
