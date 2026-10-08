-- Analytics schema for the Grafana business/error dashboards (#2394, obs P3).
-- Additive only: a new schema of read-only views plus the `grafana_ro` role.
-- No table in `public` is created, altered or dropped.
--
-- Rules for every view here:
--   * aggregates or guild-level rows only; never a user id, token, message
--     content or payment payload;
--   * days are bucketed in America/Sao_Paulo (the operator's timezone). The
--     app stores UTC in `timestamp without time zone`, so a local day is
--     (ts AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date, and
--     `inicio` is that local midnight as timestamptz for Grafana's time axis;
--   * views run with the owner's rights (no security_invoker), so RLS on the
--     base tables does not hide rows from Grafana, and grafana_ro needs no
--     grant on `public`.
--
-- Idempotent: CREATE OR REPLACE VIEW, guarded role creation, re-runnable
-- grants. The role is created NOLOGIN here; the observability profile's
-- one-shot `grafana-db-role` service sets LOGIN + the password from
-- GRAFANA_DB_PASSWORD (see observability/README.md).

CREATE SCHEMA IF NOT EXISTS analytics;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'grafana_ro') THEN
        CREATE ROLE grafana_ro NOLOGIN;
    END IF;
END
$$;

-- Guilds the bot has actually been in. Rows with joinedAt NULL were created by
-- the dashboard/integrations for guilds the bot never joined, so they are not
-- counted. `ativo` = still in the guild as far as the bot has recorded (a guild
-- removed while the bot was offline keeps leftAt NULL until it is seen again).
CREATE OR REPLACE VIEW analytics.guilds AS
SELECT
    g."discordId" AS guild_id,
    g.name AS nome,
    g."joinedAt" AT TIME ZONE 'UTC' AS entrou_em,
    g."leftAt" AT TIME ZONE 'UTC' AS saiu_em,
    g."leftAt" IS NULL AS ativo
FROM public.guilds g
WHERE g."joinedAt" IS NOT NULL;

-- Join/leave timeline from the immutable membership log.
CREATE OR REPLACE VIEW analytics.guild_membership_daily AS
WITH ev AS (
    SELECT
        (e."occurredAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
        e.kind
    FROM public.guild_membership_events e
)
SELECT
    dia,
    dia::timestamp AT TIME ZONE 'America/Sao_Paulo' AS inicio,
    count(*) FILTER (WHERE kind = 'JOIN')::int AS entradas,
    count(*) FILTER (WHERE kind = 'LEAVE')::int AS saidas
FROM ev
GROUP BY dia;

-- Command usage per local day, guild, command and outcome. guild_id is NULL
-- for commands run in DMs. error_class is only set for outcome = 'error'.
CREATE OR REPLACE VIEW analytics.commands_daily AS
WITH ev AS (
    SELECT
        (c."occurredAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
        c."guildId",
        c.command,
        c.kind,
        c.outcome,
        c."errorClass",
        c."latencyMs"
    FROM public.command_events c
)
SELECT
    dia,
    dia::timestamp AT TIME ZONE 'America/Sao_Paulo' AS inicio,
    "guildId" AS guild_id,
    command AS comando,
    kind AS tipo,
    outcome AS resultado,
    "errorClass" AS classe_erro,
    count(*)::int AS execucoes,
    round(avg("latencyMs"))::int AS latencia_media_ms,
    max("latencyMs") AS latencia_max_ms
FROM ev
GROUP BY dia, "guildId", command, kind, outcome, "errorClass";

-- Daily, 7-day and 30-day distinct active users and guilds (anyone who ran a
-- command). One row per local day from the first recorded event to today, so
-- a quiet day reads as 0 instead of repeating the last busy day.
--
-- Linear in distinct active days, not days x events: a day of activity covers
-- the next N days of an N-day window, so each user's (or guild's) active days
-- form continuous spans per window. One ordered pass (lag/lead) marks where a
-- span starts (+1) and where it ends (-1, N days after its last active day),
-- and a running sum of those marks gives the distinct count per day. A days x
-- events join timed out at ~1M events under grafana_ro's 15s statement_timeout.
CREATE OR REPLACE VIEW analytics.active_daily AS
WITH ev AS (
    SELECT
        (c."occurredAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
        c."userId",
        c."guildId"
    FROM public.command_events c
),
act AS (
    SELECT DISTINCT 'u'::text AS tipo, dia, "userId" AS k FROM ev
    UNION ALL
    SELECT DISTINCT 'g'::text, dia, "guildId" FROM ev WHERE "guildId" IS NOT NULL
),
gaps AS (
    SELECT
        tipo, dia,
        dia - lag(dia) OVER w AS antes,
        lead(dia) OVER w - dia AS depois
    FROM act
    WINDOW w AS (PARTITION BY tipo, k ORDER BY dia)
),
deltas AS (
    SELECT g.tipo, w.n, x.dia, sum(x.d)::int AS d
    FROM gaps g
    CROSS JOIN (VALUES (1), (7), (30)) AS w(n)
    CROSS JOIN LATERAL (
        SELECT g.dia, 1 AS d WHERE g.antes IS NULL OR g.antes > w.n
        UNION ALL
        SELECT g.dia + w.n, -1 WHERE g.depois IS NULL OR g.depois > w.n
    ) x
    GROUP BY g.tipo, w.n, x.dia
),
days AS (
    SELECT generate_series(
        min(dia),
        greatest(max(dia), (now() AT TIME ZONE 'America/Sao_Paulo')::date),
        interval '1 day'
    )::date AS dia
    FROM ev
),
run AS (
    SELECT g.dia, s.tipo, s.n,
        sum(coalesce(dl.d, 0)) OVER (PARTITION BY s.tipo, s.n ORDER BY g.dia)::int AS ativos
    FROM days g
    CROSS JOIN (VALUES ('u', 1), ('u', 7), ('u', 30), ('g', 1), ('g', 7), ('g', 30))
        AS s(tipo, n)
    LEFT JOIN deltas dl ON dl.tipo = s.tipo AND dl.n = s.n AND dl.dia = g.dia
)
SELECT
    dia,
    dia::timestamp AT TIME ZONE 'America/Sao_Paulo' AS inicio,
    max(ativos) FILTER (WHERE tipo = 'u' AND n = 1) AS usuarios_dia,
    max(ativos) FILTER (WHERE tipo = 'u' AND n = 7) AS usuarios_7d,
    max(ativos) FILTER (WHERE tipo = 'u' AND n = 30) AS usuarios_30d,
    max(ativos) FILTER (WHERE tipo = 'g' AND n = 1) AS guildas_dia,
    max(ativos) FILTER (WHERE tipo = 'g' AND n = 7) AS guildas_7d,
    max(ativos) FILTER (WHERE tipo = 'g' AND n = 30) AS guildas_30d
FROM run
GROUP BY dia;

-- Activation: for each JOIN, the first command in that guild after it.
-- `mensuravel` is false for joins before command recording started, whose
-- activation cannot be known; dashboards only count mensuravel rows.
CREATE OR REPLACE VIEW analytics.guild_activation AS
WITH start AS (
    SELECT min("occurredAt") AS desde FROM public.command_events
),
joins AS (
    SELECT e."guildDiscordId", e."guildName", e."occurredAt"
    FROM public.guild_membership_events e
    WHERE e.kind = 'JOIN'
)
SELECT
    j."guildDiscordId" AS guild_id,
    j."guildName" AS nome,
    j."occurredAt" AT TIME ZONE 'UTC' AS entrou_em,
    first_cmd.em AT TIME ZONE 'UTC' AS primeiro_comando_em,
    round(extract(epoch FROM first_cmd.em - j."occurredAt") / 3600.0, 1) AS horas_ate_ativar,
    first_cmd.em IS NOT NULL
        AND first_cmd.em < j."occurredAt" + interval '7 days' AS ativou_7d,
    coalesce(j."occurredAt" >= s.desde, false) AS mensuravel
FROM joins j
CROSS JOIN start s
LEFT JOIN LATERAL (
    SELECT min(c."occurredAt") AS em
    FROM public.command_events c
    WHERE c."guildId" = j."guildDiscordId"
      AND c."occurredAt" >= j."occurredAt"
) first_cmd ON true;

-- Membership retention by join week: of the guilds that added the bot in a
-- week, how many had not removed it N days later. NULL while the cohort is
-- younger than N days (not yet measurable, not zero).
CREATE OR REPLACE VIEW analytics.guild_retention_weekly AS
WITH joins AS (
    SELECT
        e."guildDiscordId",
        e."occurredAt" AS entrou,
        (
            SELECT min(l."occurredAt")
            FROM public.guild_membership_events l
            WHERE l.kind = 'LEAVE'
              AND l."guildDiscordId" = e."guildDiscordId"
              AND l."occurredAt" > e."occurredAt"
        ) AS saiu
    FROM public.guild_membership_events e
    WHERE e.kind = 'JOIN'
),
cohorts AS (
    SELECT
        date_trunc(
            'week', entrou AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo'
        )::date AS semana,
        entrou,
        saiu
    FROM joins
)
SELECT
    semana,
    semana::timestamp AT TIME ZONE 'America/Sao_Paulo' AS inicio,
    count(*)::int AS entraram,
    CASE WHEN max(entrou) <= now() AT TIME ZONE 'UTC' - interval '1 day'
        THEN count(*) FILTER (WHERE saiu IS NULL OR saiu > entrou + interval '1 day')::int
    END AS ficaram_d1,
    CASE WHEN max(entrou) <= now() AT TIME ZONE 'UTC' - interval '7 days'
        THEN count(*) FILTER (WHERE saiu IS NULL OR saiu > entrou + interval '7 days')::int
    END AS ficaram_d7,
    CASE WHEN max(entrou) <= now() AT TIME ZONE 'UTC' - interval '30 days'
        THEN count(*) FILTER (WHERE saiu IS NULL OR saiu > entrou + interval '30 days')::int
    END AS ficaram_d30
FROM cohorts
GROUP BY semana;

-- Top.gg votes. topgg_votes keeps only each user's latest vote, so "voted in
-- the last N days" is exact (latest vote inside the window iff any vote was),
-- but a per-day history of all votes does not exist yet (P4).
CREATE OR REPLACE VIEW analytics.topgg_votes_summary AS
SELECT
    count(*)::int AS votantes_total,
    count(*) FILTER (
        WHERE v."lastVoteAt" > now() AT TIME ZONE 'UTC' - interval '24 hours'
    )::int AS votaram_24h,
    count(*) FILTER (
        WHERE v."lastVoteAt" > now() AT TIME ZONE 'UTC' - interval '7 days'
    )::int AS votaram_7d,
    count(*) FILTER (
        WHERE v."lastVoteAt" > now() AT TIME ZONE 'UTC' - interval '30 days'
    )::int AS votaram_30d,
    -- A streak resets after 36h without a vote, so only live streaks count.
    coalesce(max(v.streak) FILTER (
        WHERE v."lastVoteAt" > now() AT TIME ZONE 'UTC' - interval '36 hours'
    ), 0) AS maior_sequencia_ativa
FROM public.topgg_votes v;

-- Music played per local day, guild and source.
CREATE OR REPLACE VIEW analytics.music_daily AS
WITH ev AS (
    SELECT
        (t."playedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
        t."guildId",
        t.source,
        t.skipped,
        t."isAutoplay",
        t."playDuration"
    FROM public.track_history t
)
SELECT
    dia,
    dia::timestamp AT TIME ZONE 'America/Sao_Paulo' AS inicio,
    "guildId" AS guild_id,
    source AS fonte,
    count(*)::int AS musicas,
    count(*) FILTER (WHERE skipped)::int AS puladas,
    count(*) FILTER (WHERE "isAutoplay")::int AS autoplay,
    coalesce(sum("playDuration"), 0)::bigint AS segundos_ouvidos
FROM ev
GROUP BY dia, "guildId", source;

-- In-bot feedback per local day and category (counts only, never the text).
CREATE OR REPLACE VIEW analytics.feedback_daily AS
SELECT
    (f."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
    ((f."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date)::timestamp
        AT TIME ZONE 'America/Sao_Paulo' AS inicio,
    f.category::text AS categoria,
    count(*)::int AS quantidade
FROM public.user_feedback f
GROUP BY 1, 2, 3;

-- Since when each source has data, so a dashboard never reads "no data yet"
-- as "zero usage".
CREATE OR REPLACE VIEW analytics.data_coverage AS
SELECT 'comandos'::text AS fonte,
    min("occurredAt") AT TIME ZONE 'UTC' AS desde,
    max("occurredAt") AT TIME ZONE 'UTC' AS ultimo
FROM public.command_events
UNION ALL
SELECT 'entradas e saidas de servidor',
    min("occurredAt") AT TIME ZONE 'UTC',
    max("occurredAt") AT TIME ZONE 'UTC'
FROM public.guild_membership_events
UNION ALL
SELECT 'musicas tocadas',
    min("playedAt") AT TIME ZONE 'UTC',
    max("playedAt") AT TIME ZONE 'UTC'
FROM public.track_history;

-- grafana_ro reads the analytics views and nothing else. Tables in public grant
-- nothing to PUBLIC, so revoking the role's own grants there is enough.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM grafana_ro;
REVOKE CREATE ON SCHEMA public FROM grafana_ro;
GRANT USAGE ON SCHEMA analytics TO grafana_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA analytics TO grafana_ro;
ALTER ROLE grafana_ro SET statement_timeout = '15s';
ALTER ROLE grafana_ro CONNECTION LIMIT 5;
