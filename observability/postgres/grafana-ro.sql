-- Read-only Postgres role for the Grafana dashboards (issue #2394).
--
-- Idempotent: rerun after restoring a dump on a new host (roles are not in
-- pg_dump) or after a migration that drops and recreates a granted table.
-- Expects psql variable `pw` (the password). Pass it on stdin, never in argv.
-- Without `pw` (unset or empty) it only refreshes the grants of an existing
-- grafana_ro and leaves its password alone; with no role yet it refuses to run
-- (exit 3, nothing changed). The deploy runs it that way after migrations.
--
-- On the homelab the secret is owned by Grafana (uid 472), so reading it needs
-- sudo, and `cat` may be aliased (hence `command cat`):
--
--   ssh homelab
--   cd ~/Lucky
--   sudo -v
--   pw="$(sudo cat ~/homelab/secrets/lucky_grafana_ro_password)" && [ -n "$pw" ] && { printf "\\set pw '%s'\n" "$pw"; command cat observability/postgres/grafana-ro.sql; } | docker exec -i lucky-postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -1 -q'; unset pw
--
-- Access model: column-level SELECT on product tables only. No user ids
-- (userId, playedBy, discordUserId), no tokens, sessions, logs or payments.
-- Column grants instead of an `analytics` view schema: views would block
-- Prisma enum and column migrations (ALTER COLUMN TYPE fails while a view
-- depends on the column); grants do not.
-- default_transaction_read_only and statement_timeout are guardrails a session
-- can override; the privileges below are the actual control.
-- CONNECTION LIMIT 5 is intentional: keep the Grafana datasource's
-- maxOpenConns at 5 or below (the homelab one uses 2), or panels fail with
-- "too many connections for role grafana_ro".

-- Guard: with `pw` unset or empty, never touch the password. If the role
-- already exists, only the grants below are refreshed (scripts/deploy.sh runs
-- it this way after every migration, so a table added by a migration gets its
-- grant without a manual rerun, #3295). With no role yet, abort.
\set ON_ERROR_STOP on
\if :{?pw}
\else
    \set pw ''
\endif
SELECT (:'pw' = '') AS pw_empty,
       EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'grafana_ro') AS role_exists \gset
\if :pw_empty
    \if :role_exists
        \echo 'grafana-ro.sql: pw unset, refreshing grafana_ro grants only (password unchanged).'
    \else
        \echo 'grafana-ro.sql: psql variable pw is empty or unset and grafana_ro does not exist; refusing to run.'
        DO $$ BEGIN RAISE EXCEPTION 'grafana-ro.sql aborted: empty pw'; END $$;
    \endif
\else
    SELECT format('CREATE ROLE grafana_ro LOGIN PASSWORD %L', :'pw')
    WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'grafana_ro') \gexec
    ALTER ROLE grafana_ro LOGIN PASSWORD :'pw';
\endif
ALTER ROLE grafana_ro LOGIN CONNECTION LIMIT 5
    NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
ALTER ROLE grafana_ro SET default_transaction_read_only = on;
ALTER ROLE grafana_ro SET statement_timeout = '15s';

SELECT format('REVOKE ALL ON DATABASE %I FROM grafana_ro', current_database()) \gexec
SELECT format('REVOKE TEMPORARY ON DATABASE %I FROM PUBLIC', current_database()) \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO grafana_ro', current_database()) \gexec
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM grafana_ro;
GRANT USAGE ON SCHEMA public TO grafana_ro;

GRANT SELECT ("occurredAt", "guildId", command, subcommand, kind, outcome, "latencyMs", "errorClass")
    ON command_events TO grafana_ro;
GRANT SELECT ("guildId", "playedAt", "playDuration", source, "isAutoplay", "isPlaylist", title, author)
    ON track_history TO grafana_ro;
GRANT SELECT ("guildDiscordId", "guildName", kind, "occurredAt")
    ON guild_membership_events TO grafana_ro;
GRANT SELECT ("guildId", source, mode, "isAccepted", "isRejected", "skipReason", "createdAt")
    ON recommendations TO grafana_ro;
GRANT SELECT ("discordId", name, "joinedAt", "leftAt", "createdAt")
    ON guilds TO grafana_ro;
GRANT SELECT ("lastVoteAt", streak)
    ON topgg_votes TO grafana_ro;
GRANT SELECT ("guildDiscordId", source, "createdAt")
    ON guild_join_sources TO grafana_ro;
GRANT SELECT ("guildDiscordId", kind, reason, "occurredAt")
    ON activation_events TO grafana_ro;
-- Obs P4 (#2395). Skipped until the migration that creates
-- them has run, so this script stays safe to run on an older schema.
SELECT format('GRANT SELECT (%s) ON %I TO grafana_ro', cols, t)
FROM (VALUES
        ('invite_clicks', '"occurredAt", "utmSource", "utmMedium", "utmCampaign", "utmContent", "referrerHost"'),
        ('topgg_vote_events', '"occurredAt", streak, "isWeekend"')
     ) AS v(t, cols)
WHERE to_regclass('public.' || t) IS NOT NULL \gexec

-- Most of these tables have RLS enabled with no policies
-- (migration 20250101000001_enable_rls_no_policies), which hides every row
-- from a non-owner role. A SELECT-only policy scoped to grafana_ro opens them
-- for this role alone; the column grants above still limit what it can read.
SELECT format('DROP POLICY IF EXISTS grafana_ro_read ON %I', t),
       format('CREATE POLICY grafana_ro_read ON %I FOR SELECT TO grafana_ro USING (true)', t)
FROM unnest(ARRAY['command_events', 'track_history', 'guild_membership_events',
                  'recommendations', 'guilds', 'topgg_votes',
                  'guild_join_sources', 'activation_events',
                  'invite_clicks', 'topgg_vote_events']) AS t
WHERE to_regclass('public.' || t) IS NOT NULL \gexec
