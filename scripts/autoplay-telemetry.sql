-- Autoplay telemetry read — turn on the instrument panel.
--
-- Validates the autoplay tuning arc (#1268 seed-similarity, #1272 provenance
-- guards, #1273 popularity-over-name) against the `recommendations` table the
-- engine has been writing all along, instead of tuning by ear.
--
-- Run against PROD (homelab) Postgres:
--   psql "$DATABASE_URL" -f scripts/autoplay-telemetry.sql
-- or on the homelab host:
--   docker compose -p lucky exec -T postgres \
--     psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f - < scripts/autoplay-telemetry.sql
--
-- Acceptance rate mirrors recommendationTelemetryReadService:
--   accepted / (accepted + rejected)   — pending (neither flag) excluded.
-- Window is the last 14 days; edit the interval below to widen/narrow.

\echo '=== 1. Overall summary (last 14 days) ==='
SELECT
    count(*)                                                   AS picks,
    count(*) FILTER (WHERE "isAccepted")                       AS accepted,
    count(*) FILTER (WHERE "isRejected")                       AS rejected,
    count(*) FILTER (WHERE "isAccepted" IS NULL
                      AND "isRejected" IS NULL)                AS pending,
    round(count(*) FILTER (WHERE "isAccepted")::numeric
          / nullif(count(*) FILTER (WHERE "isAccepted")
                 + count(*) FILTER (WHERE "isRejected"), 0), 3) AS acceptance_rate
FROM "recommendations"
WHERE "createdAt" >= now() - interval '14 days';

\echo '=== 2. Per-source acceptance (is seed-similar winning? is SPOTIFY_REC dead weight?) ==='
SELECT
    coalesce("source"::text, '(null)')                         AS source,
    count(*)                                                   AS picks,
    count(*) FILTER (WHERE "isAccepted")                       AS accepted,
    count(*) FILTER (WHERE "isRejected")                       AS rejected,
    count(*) FILTER (WHERE "isAccepted" IS NULL
                      AND "isRejected" IS NULL)                AS pending,
    round(count(*) FILTER (WHERE "isAccepted")::numeric
          / nullif(count(*) FILTER (WHERE "isAccepted")
                 + count(*) FILTER (WHERE "isRejected"), 0), 3) AS acceptance_rate
FROM "recommendations"
WHERE "createdAt" >= now() - interval '14 days'
GROUP BY 1
ORDER BY picks DESC;

\echo '=== 3. Per-mode acceptance (similar/discover/popular) ==='
SELECT
    coalesce("mode", '(null)')                                 AS mode,
    count(*)                                                   AS picks,
    count(*) FILTER (WHERE "isAccepted")                       AS accepted,
    count(*) FILTER (WHERE "isRejected")                       AS rejected,
    round(count(*) FILTER (WHERE "isAccepted")::numeric
          / nullif(count(*) FILTER (WHERE "isAccepted")
                 + count(*) FILTER (WHERE "isRejected"), 0), 3) AS acceptance_rate
FROM "recommendations"
WHERE "createdAt" >= now() - interval '14 days'
GROUP BY 1
ORDER BY picks DESC;

\echo '=== 4. Artist concentration (low distinct_ratio = looping few artists) ==='
SELECT
    count(*)                                                   AS picks,
    count(DISTINCT lower("author"))                            AS distinct_artists,
    round(count(DISTINCT lower("author"))::numeric
          / nullif(count(*), 0), 3)                            AS distinct_ratio
FROM "recommendations"
WHERE "createdAt" >= now() - interval '14 days';

\echo '--- top 15 artists by pick count (the same-artist-loop check) ---'
SELECT lower("author") AS artist, count(*) AS picks
FROM "recommendations"
WHERE "createdAt" >= now() - interval '14 days'
GROUP BY 1
ORDER BY 2 DESC
LIMIT 15;

\echo '=== 5. Duplicate-ish picks (same artist+title recommended multiple times) ==='
SELECT lower("author") AS artist, lower("title") AS title, count(*) AS times
FROM "recommendations"
WHERE "createdAt" >= now() - interval '14 days'
GROUP BY 1, 2
HAVING count(*) > 1
ORDER BY 3 DESC
LIMIT 20;
