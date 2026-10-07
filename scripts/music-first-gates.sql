-- Music-first continue gates (decisions/2026-09-27-music-first-positioning.md).
--
-- Read-only, aggregates only (no user ids). Produces the three gates the ADR
-- decides on 2026-12-20:
--   1. weekly active guilds (WAG): 20 or more for 3 consecutive weeks
--   2. new guilds that hear a track within their first hour: 35% or more
--   3. new guilds still active on day 8: 15% or more
--
-- Run against PROD (homelab) Postgres:
--   docker exec -i lucky-postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
--     < scripts/music-first-gates.sql
--
-- Definitions:
--   active    a guild with a track_history row or a command_events row that
--             week. command_events only exists since 2026-10-02, so earlier
--             weeks count plays only.
--   excluded  the operator's guilds, test-named guilds and listing servers, as
--             the ADR requires. Test-named guilds match by name; the rest are
--             the ids in :excluded_ids below. Palacio do Lolo (436677047159619594)
--             is counted until the owner confirms whether it is the operator's.
--             Criativaria is a regular guild since 2026-10-07.
--   new       the first JOIN in guild_membership_events inside the cohort window.
--   heard     a track_history row within 1 hour of that join.
--   day 8     activity at or after join + 7 days; only joins at least 8 days
--             old are eligible.
--
-- Windows fit retention: DatabaseService.cleanupOldData deletes track_history
-- rows older than 30 days, so a join older than that always reads as "never
-- heard a track". Both reads therefore cover the last 4 weeks; run this at
-- least every 4 weeks to keep a continuous series.
--
-- Known undercounts: track_history keeps the last 100 rows per guild and
-- autoplay writes a row at enqueue time (#2667), so play counts are not
-- reliable here; the gates only use "any row", which both issues leave intact.

\set excluded_ids '{110373943822540800,333949691962195969,1541452011466268704}'
-- 110373943822540800  Discord Bots (listing server)
-- 333949691962195969  Top.gg Verification Center (listing review)
-- 1541452011466268704 Lucky's Support Server (operator)

BEGIN TRANSACTION READ ONLY;
\pset pager off

\echo '=== 1. Weekly active guilds, last 4 weeks (gate: >= 20 for 3 consecutive weeks) ==='
WITH excluded AS (
    SELECT unnest(:'excluded_ids'::text[]) AS g
    UNION SELECT "discordId" FROM guilds WHERE name ILIKE '%test%'
    UNION SELECT "guildDiscordId" FROM guild_membership_events
          WHERE "guildName" ILIKE '%test%'
),
activity AS (
    SELECT date_trunc('week', "playedAt")::date AS wk, "guildId" AS g
    FROM track_history WHERE "playedAt" >= date_trunc('week', now()) - interval '3 weeks'
    UNION
    SELECT date_trunc('week', "occurredAt")::date, "guildId"
    FROM command_events
    WHERE "guildId" IS NOT NULL
      AND "occurredAt" >= date_trunc('week', now()) - interval '3 weeks'
)
SELECT w.wk::date AS week_start,
       count(DISTINCT a.g) AS wag,
       count(DISTINCT a.g) >= 20 AS meets_gate
FROM generate_series(date_trunc('week', now()) - interval '3 weeks',
                     date_trunc('week', now()), interval '1 week') AS w(wk)
LEFT JOIN activity a
       ON a.wk = w.wk::date AND a.g NOT IN (SELECT g FROM excluded)
GROUP BY w.wk
ORDER BY w.wk;

\echo '=== 2+3. New-guild cohort, joins in the last 28 days, by join week ==='
\echo '    (gates: heard_1h_pct >= 35, active_d8_pct >= 15; last row is the total)'
WITH excluded AS (
    SELECT unnest(:'excluded_ids'::text[]) AS g
    UNION SELECT "discordId" FROM guilds WHERE name ILIKE '%test%'
    UNION SELECT "guildDiscordId" FROM guild_membership_events
          WHERE "guildName" ILIKE '%test%'
),
joins AS (
    SELECT DISTINCT ON ("guildDiscordId") "guildDiscordId" AS g, "occurredAt" AS t
    FROM guild_membership_events
    WHERE kind = 'JOIN' AND "occurredAt" > now() - interval '28 days'
    ORDER BY "guildDiscordId", "occurredAt"
),
cohort AS (
    SELECT j.g, j.t,
        EXISTS (SELECT 1 FROM track_history th
                WHERE th."guildId" = j.g
                  AND th."playedAt" BETWEEN j.t AND j.t + interval '1 hour') AS heard_1h,
        j.t <= now() - interval '8 days' AS d8_eligible,
        EXISTS (SELECT 1 FROM track_history th
                WHERE th."guildId" = j.g AND th."playedAt" >= j.t + interval '7 days')
        OR EXISTS (SELECT 1 FROM command_events ce
                   WHERE ce."guildId" = j.g AND ce."occurredAt" >= j.t + interval '7 days')
            AS active_d8
    FROM joins j
    WHERE j.g NOT IN (SELECT g FROM excluded)
)
SELECT coalesce(date_trunc('week', t)::date::text, 'total') AS join_week,
       count(*) AS joins,
       count(*) FILTER (WHERE heard_1h) AS heard_1h,
       round(100.0 * count(*) FILTER (WHERE heard_1h) / nullif(count(*), 0), 1)
           AS heard_1h_pct,
       count(*) FILTER (WHERE d8_eligible) AS d8_eligible,
       count(*) FILTER (WHERE d8_eligible AND active_d8) AS active_d8,
       round(100.0 * count(*) FILTER (WHERE d8_eligible AND active_d8)
             / nullif(count(*) FILTER (WHERE d8_eligible), 0), 1) AS active_d8_pct
FROM cohort
GROUP BY ROLLUP (date_trunc('week', t)::date)
ORDER BY date_trunc('week', t)::date NULLS LAST;

ROLLBACK;
