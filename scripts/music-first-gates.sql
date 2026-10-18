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
--   joins     counted joins (ADR amendment 5, decisions/2026-10-18-music-first-
--             business-review-amendments.md): a JOIN counts unless the same guild
--             had another JOIN in the 30 days before it, so add, remove and
--             re-add cycles inside 30 days count once and a re-add after more
--             than 30 days counts again. The comparison is with the previous
--             JOIN event, so a chain of re-adds each under 30 days apart
--             collapses to its first join.
--   new       a guild with a counted join inside the cohort window; the cohort
--             clock (first hour, day 8) starts at that counted join.
--   WAG       the three gate weeks are fixed by the ADR: Monday to Sunday weeks
--             ending 2026-11-29, 2026-12-06 and 2026-12-13 (week_start below).
--             `closed` is false until the week has ended; a week that is not
--             closed reads low by construction.
--
-- Shared definitions: the counted_joins and wag_windows blocks between the
-- BEGIN SHARED / END SHARED markers below are the single source. The Grafana
-- dashboard (observability/grafana/build_dashboards.py) extracts them from this
-- file when generating lucky-negocio.json, so the two cannot drift. Edit them
-- only here, then regenerate the dashboards.
--   heard     a track_history row within 1 hour of that join; only joins at
--             least 1 hour old are eligible.
--   day 8     activity at or after join + 7 days; only joins at least 8 days
--             old are eligible.
--
-- Windows fit retention: DatabaseService.cleanupOldData deletes track_history
-- rows older than 30 days, so a join older than that always reads as "never
-- heard a track". The cohort read therefore covers the last 4 weeks. The WAG
-- read needs plays of the gate weeks, which are purged 30 days after they
-- happen: read each week soon after it closes and record the number.
--
-- Known undercounts: track_history keeps the last 100 rows per guild and
-- autoplay writes a row at enqueue time (#2667), so play counts are not
-- reliable here; the gates only use "any row". The cap can still hide a
-- first-hour row: a guild that played 100+ tracks since joining may have had
-- it trimmed. h1_unknown counts eligible joins where that happened (100 rows
-- kept, oldest after join + 1 hour); they stay in the denominator as misses,
-- so heard_1h_pct is a floor.

\set excluded_ids '{110373943822540800,333949691962195969,1541452011466268704}'
-- 110373943822540800  Discord Bots (listing server)
-- 333949691962195969  Top.gg Verification Center (listing review)
-- 1541452011466268704 Lucky's Support Server (operator)

-- REPEATABLE READ: every statement reads the same snapshot.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
\pset pager off

\echo '=== 1. Weekly active guilds in the ADR gate weeks (gate: >= 20 in all 3) ==='
WITH excluded AS (
    SELECT unnest(:'excluded_ids'::text[]) AS g
    UNION SELECT "discordId" FROM guilds WHERE name ILIKE '%test%'
    UNION SELECT "guildDiscordId" FROM guild_membership_events
          WHERE "guildName" ILIKE '%test%'
),
-- BEGIN SHARED wag_windows
wag_windows AS (
    SELECT week_start FROM (VALUES (DATE '2026-11-23'), (DATE '2026-11-30'), (DATE '2026-12-07')) AS v(week_start)
),
-- END SHARED wag_windows
activity AS (
    SELECT date_trunc('week', "playedAt")::date AS wk, "guildId" AS g
    FROM track_history WHERE "playedAt" >= (SELECT min(week_start) FROM wag_windows)
    UNION
    SELECT date_trunc('week', "occurredAt")::date, "guildId"
    FROM command_events
    WHERE "guildId" IS NOT NULL
      AND "occurredAt" >= (SELECT min(week_start) FROM wag_windows)
)
SELECT w.week_start,
       w.week_start + 6 AS week_end,
       count(DISTINCT a.g) AS wag,
       count(DISTINCT a.g) >= 20 AS meets_gate,
       w.week_start + 7 <= now()::date AS closed
FROM wag_windows w
LEFT JOIN activity a
       ON a.wk = w.week_start AND a.g NOT IN (SELECT g FROM excluded)
GROUP BY w.week_start
ORDER BY w.week_start;

\echo '=== 2+3. New-guild cohort, counted joins in the last 28 days, by join week ==='
\echo '    (gates: heard_1h_pct >= 35, active_d8_pct >= 15; last row is the total)'
WITH excluded AS (
    SELECT unnest(:'excluded_ids'::text[]) AS g
    UNION SELECT "discordId" FROM guilds WHERE name ILIKE '%test%'
    UNION SELECT "guildDiscordId" FROM guild_membership_events
          WHERE "guildName" ILIKE '%test%'
),
-- BEGIN SHARED counted_joins
counted_joins AS (
    SELECT g, t FROM (
        SELECT "guildDiscordId" AS g, "occurredAt" AS t,
               lag("occurredAt") OVER (PARTITION BY "guildDiscordId" ORDER BY "occurredAt") AS prev
        FROM guild_membership_events
        WHERE kind = 'JOIN'
    ) j
    WHERE prev IS NULL OR t - prev > interval '30 days'
),
-- END SHARED counted_joins
joins AS (
    SELECT g, t FROM counted_joins WHERE t > now() - interval '28 days'
),
cohort AS (
    SELECT j.g, j.t,
        EXISTS (SELECT 1 FROM track_history th
                WHERE th."guildId" = j.g
                  AND th."playedAt" BETWEEN j.t AND j.t + interval '1 hour') AS heard_1h,
        j.t <= now() - interval '1 hour' AS h1_eligible,
        (SELECT count(*) >= 100 AND min(th."playedAt") > j.t + interval '1 hour'
         FROM track_history th WHERE th."guildId" = j.g) AS h1_trimmed,
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
       count(*) FILTER (WHERE h1_eligible) AS h1_eligible,
       count(*) FILTER (WHERE h1_eligible AND heard_1h) AS heard_1h,
       round(100.0 * count(*) FILTER (WHERE h1_eligible AND heard_1h)
             / nullif(count(*) FILTER (WHERE h1_eligible), 0), 1) AS heard_1h_pct,
       count(*) FILTER (WHERE h1_eligible AND NOT heard_1h AND h1_trimmed)
           AS h1_unknown,
       count(*) FILTER (WHERE d8_eligible) AS d8_eligible,
       count(*) FILTER (WHERE d8_eligible AND active_d8) AS active_d8,
       round(100.0 * count(*) FILTER (WHERE d8_eligible AND active_d8)
             / nullif(count(*) FILTER (WHERE d8_eligible), 0), 1) AS active_d8_pct
FROM cohort
GROUP BY ROLLUP (date_trunc('week', t)::date)
ORDER BY date_trunc('week', t)::date NULLS LAST;

ROLLBACK;
