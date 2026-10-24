-- Fix double-encoded details in server_logs (#2371).
-- Rows written before this migration stored details as a JSON string scalar
-- (e.g. '"{\\"key\\":\\"value\\"}"') instead of a JSON object. This backfill
-- unwraps those rows so details is queryable as jsonb.
UPDATE server_logs
SET details = (details #>> '{}')::jsonb
WHERE jsonb_typeof(details::jsonb) = 'string';
