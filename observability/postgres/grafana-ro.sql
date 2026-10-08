-- Read-only Postgres role for the Grafana dashboards (issue #2394).
--
-- Idempotent: rerun after restoring a dump on a new host (roles are not in
-- pg_dump) or after a migration that drops and recreates a granted table.
-- Expects psql variable `pw` (the password). Pass it on stdin, never in argv:
--
--   { printf "\\set pw '%s'\n" "$(cat <password-file>)"; cat observability/postgres/grafana-ro.sql; } \
--     | docker exec -i lucky-postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -1 -q'
--
-- Access model: column-level SELECT on product tables only. No user ids
-- (userId, playedBy, discordUserId), no tokens, sessions, logs or payments.
-- Column grants instead of an `analytics` view schema: views would block
-- Prisma enum and column migrations (ALTER COLUMN TYPE fails while a view
-- depends on the column); grants do not.
-- default_transaction_read_only and statement_timeout are guardrails a session
-- can override; the privileges below are the actual control.

SELECT format('CREATE ROLE grafana_ro LOGIN PASSWORD %L', :'pw')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'grafana_ro') \gexec
ALTER ROLE grafana_ro LOGIN PASSWORD :'pw' CONNECTION LIMIT 5
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
GRANT SELECT ("guildId", "playedAt", source, "isAutoplay", "isPlaylist", title, author)
    ON track_history TO grafana_ro;
GRANT SELECT ("guildDiscordId", "guildName", kind, "occurredAt")
    ON guild_membership_events TO grafana_ro;
GRANT SELECT ("guildId", source, mode, "isAccepted", "isRejected", "skipReason", "createdAt")
    ON recommendations TO grafana_ro;
GRANT SELECT ("discordId", name, "joinedAt", "leftAt", "createdAt")
    ON guilds TO grafana_ro;
GRANT SELECT ("lastVoteAt", streak)
    ON topgg_votes TO grafana_ro;

-- Most of these tables have RLS enabled with no policies
-- (migration 20250101000001_enable_rls_no_policies), which hides every row
-- from a non-owner role. A SELECT-only policy scoped to grafana_ro opens them
-- for this role alone; the column grants above still limit what it can read.
SELECT format('DROP POLICY IF EXISTS grafana_ro_read ON %I', t),
       format('CREATE POLICY grafana_ro_read ON %I FOR SELECT TO grafana_ro USING (true)', t)
FROM unnest(ARRAY['command_events', 'track_history', 'guild_membership_events',
                  'recommendations', 'guilds', 'topgg_votes']) AS t \gexec
