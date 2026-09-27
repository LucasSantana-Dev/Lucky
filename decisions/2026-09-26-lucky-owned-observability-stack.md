# ADR 2026-09-26: Lucky owns its observability stack as code, portable to any host

**Status:** Accepted (after one adversarial critic pass, verdict "proceed with changes"; all required changes applied below)
**Deciders:** Lucas Santana
**Related issues:** #2385 (Sentry 100% sampling), #2386 (multi-line logs), #2387 (Prometheus/Grafana/Alertmanager absent on homelab), #2369 (retention sweep), #1651 (alert black hole)
**Related:** `decisions/2026-06-16-info-log-aggregation-loki.md`, `decisions/2026-07-01-bot-monitoring-dead-man-first.md`, `decisions/2026-05-30-observability-remediation-strategy.md`, `decisions/2026-07-02-resource-hygiene-alert-calibration-first.md`
**Supersedes (in part):** the 2026-07-01 deferral of the logging-quality track; the 2026-06-16 assumption that the homelab stack hosts Lucky's telemetry.

## Context

On 2026-09-26 the bot was added to the 94k-member "Discord Bots" guild. Answering "what is this server and did it use any command" exposed four gaps:

1. **No product telemetry.** No command invocation is recorded: no table, no metric. The only log line (`packages/bot/src/handlers/commandsHandler.ts:205`) is `debugLog` without guildId, suppressed in prod (`LOG_LEVEL=2`). The other hook, `monitorCommandExecution`, is only a Sentry breadcrumb. DAU/WAU, per-guild usage, error rate per command, activation and retention cannot be computed.
2. **Logs are not queryable.** One log call becomes 1 + N Loki entries because `data` is pretty-printed across lines (`packages/shared/src/utils/general/log/service.ts:130-155, 274-278`, #2386). guildId/userId only exist in the fragments.
3. **Ops telemetry is silently dead.** On the homelab, Prometheus, Grafana and Alertmanager containers do not exist, gatus exited 6 days ago and healthchecks web is down (#2387). Lucky's metrics are exposed and never scraped; `monitoring/prometheus/lucky-alerts.rules.yml` says in its own header it is not auto-loaded. Nothing reported any of it.
4. **Not portable.** Prometheus, Loki, promtail and Grafana configuration live in the homelab repo. There is no Postgres backup in this repo. Moving Lucky to a VPS today loses all observability and has no tested data path.

Business data is thin: `guild_subscriptions` exists but no code writes it; `topgg_votes` keeps one row per user (`userId @unique`); `/invite` UTM parameters exist only as a Loki line.

The 2026-07-01 ADR deferred structured logging "until the next incident where diagnosis is slowed by log quality". Today's investigation is that trigger.

Operator constraints: solo developer; Lucky must move from the homelab to a cloud VM or VPS without friction; self-hosted, Lucky-owned stack chosen over Grafana Cloud or a hybrid; LGPD/GDPR apply.

## Decision

### 1. Lucky owns its observability, as code, in this repo

- New top-level `observability/` directory holds all configuration: Prometheus (scrape config, alert rules, `--storage.tsdb.retention.time=30d` and `--storage.tsdb.retention.size=5GB`, a conservative cap given the homelab host's disk headroom at the time of writing (~101 GB free of 468 GB, 78% used) shared with Postgres), Loki (config, `retention_period`, compactor with a size ceiling), Alloy (collector), node_exporter, Grafana (datasources, dashboards, alert rules, contact points, notification policies, admin credentials from `.env`, all provisioned from files).
- The stack runs as a Compose **profile** `observability` in Lucky's own `docker-compose.yml` (the file already uses a `tunnel` profile). Every new service has an explicit `mem_limit`. **No service binds a host port.** Grafana is reached by running a throwaway `socat` forwarder container on `lucky-network` that publishes it on host loopback (`docker run --rm -it --network lucky-network -p 127.0.0.1:3000:3000 alpine/socat TCP-LISTEN:3000,fork TCP:grafana:3000`), then an SSH local forward (`ssh -L 3000:127.0.0.1:3000 <user>@<homelab-host>`) from the operator's machine when the stack runs on the homelab; see `observability/README.md` and `docs/observability.md`. This forwarder is a one-off command the operator types when needed, not a persistent service in `docker-compose.yml`, so the pinned-tag policy below (for the stack's own services) does not apply to it. Optionally, Grafana can also be reached through the Cloudflare tunnel (see 5).
- **Alloy** replaces promtail for Lucky. Discovery matches `lucky-bot` and `lucky-backend` (and later other app containers by an explicit allowlist), never a `lucky-*` wildcard, so staging, tunnel, webhook and Postgres containers are not ingested. Labels: `service`, `env`, `level` only. Alloy strips the leading `[LEVEL]` token so the stored line is pure JSON and LogQL `| json` works. guildId, userId and correlationId stay in the body, never labels.
- `monitoring/prometheus/lucky-alerts.rules.yml` moves into `observability/` and is loaded.
- Grafana state is disposable only because everything is provisioned. **UI edits are lost by design**; dashboards are repo-owned JSON. Images use pinned tags, bumped quarterly.
- The homelab's own monitoring stays a homelab concern for other apps. During cutover the `lucky-monitoring` network is kept, and homelab promtail is told to stop scraping Lucky containers to avoid double ingestion.

### 2. Four data layers, each with one home

| Question type | Home | Retention |
|---|---|---|
| Ops logs ("what happened at 14:02 in guild X") | Loki, single-line JSON | 30 d, size-capped |
| Dev/ops metrics (latency, error rate, gateway, memory, disk) | Prometheus | 30 d, size-capped |
| Errors with stack traces | Sentry (SaaS, unchanged; sampling fixed in #2385) | Sentry plan |
| Product and business facts | **Postgres**, the source of truth | per table, see 3 |

Grafana is the single pane: Prometheus and Loki for ops, and Postgres for product and business through a restricted role (see 3).

### 3. Product and business events live in Postgres

- `command_events`: one row per slash command, context menu and component interaction handled: `occurredAt`, `guildId`, `userId`, `command`, `subcommand`, `kind` (`slash` / `context` / `component`), `outcome` (`ok` / `user_error` / `error` / `denied`), `latencyMs`, `errorClass`, `shardId`.
- **Write path, no silent drops.** Events go to a bounded in-memory buffer flushed with `createMany` every N seconds or N rows. On overflow or flush failure: increment `lucky_bot_command_events_dropped_total{reason}`, rate-limited `warnLog`, never block or fail the command. An alert fires on any sustained drop rate. The Prisma pool size is set explicitly (today `PrismaPg` uses the node-pg default of 10, shared with command handling) and the buffer uses at most one connection per flush.
- Per-command Prometheus metrics from the same hook: `lucky_bot_commands_total{command,kind,outcome}` and `lucky_bot_command_duration_seconds{command}`. No guild or user label.
- **User ids are stored as-is, minimized by retention.** HMAC pseudonymization was considered and dropped: Discord ids already sit in plaintext in `users`, `topgg_votes` and `server_logs`, and hashing would break joins with dashboard users while adding a secret whose rotation resets retention history. Minimization comes from retention and from the analytics views exposing aggregates only.
- **Retention:** `command_events` 180 d, `invite_clicks` 180 d, `topgg_vote_events` 400 d, all pruned by the daily retention sweep introduced in #2369. **P1 depends on #2369 being merged** and extends its sweep to these tables.
- **Invite attribution by time-window correlation** (operator decision). `/invite` persists each click (`invite_clicks`: utm fields, referrer host, timestamp). A view matches each `guild_membership_events` JOIN to the nearest preceding click within a short window (starting at 10 minutes, tuned with data). It is approximate by design and labelled as such on dashboards. The OAuth flow and the Discord portal are not changed.
- `topgg_vote_events`: append-only vote history written by the existing webhook; `topgg_votes` stays as the per-user summary.
- **Grafana database access is limited to an `analytics` schema of views** (operator decision). A dedicated role `grafana_ro` gets `USAGE` on `analytics` and `SELECT` on its views only, with `REVOKE ALL` on `public`. Views expose aggregates and minimal columns (command counts by day and guild, join/leave timeline, vote counts, invite correlation, guild counts). The role never reaches `lastfm_links` / `spotify_links` tokens, `sessions`, `server_logs.details` message content or `stripe_webhook_events.payload`. The view definitions live in a Prisma migration, so they travel with the schema.

### 4. "You will find out" holds for the stack itself

- Grafana alerting sends a **Watchdog** heartbeat every minute to an **off-box** check (healthchecks.io free). If Prometheus, Grafana or the host dies, the off-box check emails the operator. This closes the #2387 failure mode.
- **Disk is monitored inside the profile**: node_exporter plus a disk-free alert (warn below 20%, critical below 10%). Prometheus and Loki are size-capped so telemetry cannot fill the disk that Postgres shares.
- Contact points: a non-Discord channel (email) as primary, per the 2026-07-01 ADR; Discord as the rich secondary. Alert thresholds inherit the 2026-07-02 calibration.
- The bot heartbeat stays. The env var mismatch is fixed on the way: `heartbeat.ts` reads `HEALTHCHECK_URL_EXTERNAL` while compose declares `HEARTBEAT_PING_URL`.

### 5. Portability contract

- Everything Lucky needs is in this repo plus `.env`. Grafana is reachable without any host edit through a throwaway `socat` forwarder container plus an SSH local forward, per 1 above. Exposing Grafana on a hostname is optional and needs two steps outside the repo, listed in `observability/README.md`: a tunnel ingress rule (the repo ships the ingress config; the tunnel token comes from `.env`) and a Cloudflare Access policy in the Zero Trust dashboard.
- **Postgres backup** (operator decision): daily `pg_dump`, encrypted with `age` on the host before upload, sent to Cloudflare R2, 30-day retention, with a monthly automated restore test into a scratch container that checks row counts. This is on the critical path: the portability drill starts from one of these dumps.
- Prometheus and Loki volumes are disposable (history is lost on move, by design); Grafana is fully provisioned. Only Postgres (and its R2 dumps) is backup-critical.
- **Resource floor:** the new services have explicit `mem_limit`s (Prometheus 512m, Loki 512m, Grafana 256m, Alloy 192m, node_exporter 64m). Added to the existing limits (about 3.5 GB) that is about 5 GB of limits, so a target host needs **8 GB RAM** (6 GB is the tight minimum). Heavy Loki `| json` queries over 30 days can spike; the Loki limit and query limits bound them.
- **Portability drill** (exit criterion): on a clean VM with Docker, the repo and `.env`, restore the latest R2 dump, then bring the stack up. `docker compose --profile observability up -d` with no service arguments also starts every unprofiled service (the homelab-only `webhook` deploy receiver included, since it carries no profile of its own), which is out of the drill's scope. To keep it out, name every app and observability service explicitly on the command line, for example `docker compose --profile observability up -d postgres redis bot backend frontend nginx prometheus grafana` plus the rest of the observability-profile services as listed in `observability/README.md` at drill time — naming services this way starts only those services and their dependencies and leaves `webhook` and the `tunnel` profile down. See dashboards populate and a synthetic alert reach email.

## Phases

- **P0, no-regret fixes:** #2385 (Sentry sampling 0.1) and #2386 (single-line JSON logs keeping the `[LEVEL]` prefix, stack as a string field, no ANSI colour in prod). P2b depends on #2386.
- **P1, product events:** `command_events` + buffered writer + drop counter + per-command metrics + explicit pool size. Depends on #2369 merged.
- **P2a, one-hour prototype (the big-bang gate):** Prometheus + Grafana only, in the Compose profile, scraping the existing `/metrics`, loading `lucky-alerts.rules.yml`, Watchdog to healthchecks.io, disk alert. Count friction points; more than 3 means stop and revisit the platform choice.
- **P2b, logs:** Loki + Alloy, gated on P2a passing and #2386 deployed. Cut Lucky out of homelab promtail.
- **P3, dashboards and alerts:** `analytics` views + `grafana_ro` role; Dev, Product and Business dashboards; command-event drop alert.
- **P4, attribution and history:** `invite_clicks` + correlation view, `topgg_vote_events`.
- **P5, backup and drill:** R2 encrypted dumps + monthly restore test, then the portability drill. The work is not done until the drill passes.

## Alternatives considered

- **Grafana Cloud (managed).** Zero ops and survives a host death. Rejected by the operator: product and business dashboards need the Postgres reachable from the cloud (PDC agent) or copied aggregates; free-tier limits; user data leaves our infrastructure.
- **Hybrid** (Grafana Cloud for ops, self-hosted Grafana for SQL). Rejected: two systems for a solo operator.
- **Restart the homelab stack.** Rejected: not portable, config outside the repo, already failed silently.
- **Product analytics SaaS (PostHog, Mixpanel).** Rejected for now: data transfer and a new vendor; SQL answers the current questions.
- **HMAC-pseudonymized user ids.** Rejected: see 3.
- **Exact OAuth-callback attribution.** Rejected by the operator for now: needs a registered redirect URI and changes the auth flow; correlation is good enough at current volume.
- **OpenTelemetry tracing now.** Deferred: no cross-service latency question yet; Alloy speaks OTLP when needed.

## Consequences

**Positive:** every question from the 2026-09-26 investigation becomes a query; Lucky moves hosts with its telemetry and a tested backup; the stack is watched from outside and cannot fill the disk; product data stays in our DB behind views.

**Negative:** the operator runs five more containers (upgrades, disk); about 1.5 GB more RAM of limits; one buffered batch insert per few seconds; a new R2 bucket and an encryption key to keep safe (losing the `age` key makes the backups useless).

**Neutral:** Sentry unchanged apart from sampling; the homelab keeps monitoring its other apps.

## Revisit when

- `command_events` exceeds about 5M rows or flushes show in DB latency: add daily rollups and shorten raw retention.
- The target host has under 6 GB RAM: move the stack to a separate small VM, or revisit Grafana Cloud for ops only.
- Prometheus exceeds 10k active series: audit labels.
- Invite correlation shows ambiguous matches above ~10% of joins: reconsider the OAuth callback.
- The bot shards: `shardId` is already in events; add per-shard heartbeat and metric labels.
