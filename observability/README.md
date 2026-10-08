# Lucky observability stack (P2a prototype)

Phase P2a of `decisions/2026-09-26-lucky-owned-observability-stack.md`:
Prometheus, Alertmanager, Grafana, node_exporter, and cAdvisor, provisioned
entirely from files, running as the `observability` Compose profile alongside
the app. See issue #2392. For a non-technical guide to the dashboards and
what to do when an alert fires, see [`docs/observability.md`](../docs/observability.md).

## Run it

```sh
docker compose --profile observability up -d
```

This starts `prometheus`, `alertmanager` (plus the one-shot
`alertmanager-config` renderer), `grafana` (plus the one-shot
`grafana-db-role`), `node-exporter`, and `cadvisor` in
addition to whatever other profile(s)/services you already run. None of them
bind a host port.

Bring it down with:

```sh
docker compose --profile observability down
```

## Reach Grafana without a host port

Grafana only listens on the internal `lucky-network`. To open the UI from your
machine (or over SSH from the homelab), run a throwaway `socat` forwarder
container on that network and tunnel to it, so nothing in the persistent stack
gets a host port:

```sh
# On the host running the Compose stack (foreground; Ctrl-C to stop):
docker run --rm -it \
  --network lucky-network \
  -p 127.0.0.1:3000:3000 \
  alpine/socat:1.8.1.1 TCP-LISTEN:3000,fork TCP:grafana:3000
```

Then, if you're on the same machine, open `http://localhost:3000`. If the
Compose stack runs on the homelab and you're elsewhere, add an SSH local
forward on top:

```sh
ssh -L 3000:127.0.0.1:3000 <user>@<homelab-host>
# then open http://localhost:3000 locally
```

Stop the `socat` container when done (`Ctrl-C`); it never persists and never
opens a host port beyond the loopback-bound one you started yourself.

## Env vars

All read from `.env` (not committed). Names and placeholder values (never
real secrets) are documented in `.env.example` at the repo root.

| Var | Used by | Purpose |
| --- | --- | --- |
| `GRAFANA_ADMIN_USER` | grafana | Initial admin username (`GF_SECURITY_ADMIN_USER`). |
| `GRAFANA_ADMIN_PASSWORD` | grafana | Initial admin password (`GF_SECURITY_ADMIN_PASSWORD`). |
| `GRAFANA_DB_PASSWORD` | grafana-db-role, grafana | Login password for the read-only `grafana_ro` Postgres role behind the business dashboards. |
| `ALERT_EMAIL_TO` | alertmanager-config (templated into alertmanager.yml) | Where non-Watchdog alerts land. |
| `WATCHDOG_PING_URL` | alertmanager, via a Compose secret (`watchdog_ping_url`) | Off-box healthchecks.io (or similar) ping URL. The Watchdog alert (always firing) hits this every minute; losing the ping is the alarm. |
| `SMTP_HOST` | alertmanager-config (templated) | SMTP server host, combined with `SMTP_PORT` into `smtp_smarthost`. |
| `SMTP_PORT` | alertmanager-config (templated) | SMTP port, default `587`. |
| `SMTP_USER` | alertmanager-config (templated) | SMTP auth username. |
| `SMTP_PASSWORD` | alertmanager, via a Compose secret (`smtp_password`) | SMTP auth password. Never templated into the rendered config file. |
| `SMTP_FROM_ADDRESS` | alertmanager-config (templated) | "From" address on alert emails. |
| `HEARTBEAT_PING_URL_BOT` / `_BOT_EXTERNAL` | bot only | On-box / off-box dead-man ping target for the bot (issue #2390). Compose maps these into the bot's `HEARTBEAT_PING_URL(_EXTERNAL)`. |
| `HEARTBEAT_PING_URL_BACKEND` / `_BACKEND_EXTERNAL` | backend only | Same, for the backend. Separate vars per service so a URL-keyed external monitor can tell them apart. |
| `HEARTBEAT_INTERVAL_MS` | bot, backend | Heartbeat interval, default `60000`. |

None of the above are read by this PR's code from any `.env*` file directly;
they're consumed at container-start time by Compose/Alertmanager/Grafana/the
app. Grafana no longer needs any SMTP or contact-point env vars: it is
dashboards-only now (see "Alerting architecture" below).

## Alerting architecture: Prometheus + Alertmanager, Grafana is dashboards only

Switched from the initial Grafana-managed alerting to Prometheus native rules
plus Alertmanager, per operator decision, so alert rules have exactly ONE
source of truth: `observability/prometheus/rules/*.yml`. Prometheus evaluates
them (`rule_files`) and forwards firing alerts to Alertmanager
(`alerting.alertmanagers` in `prometheus.yml`), which owns grouping, routing,
and delivery. Grafana only reads the same Prometheus datasource for
dashboards; it has no alert rules, contact points, or notification policies
of its own anymore (`observability/grafana/provisioning/alerting/` was
removed).

**Why the switch:** the previous Grafana-managed setup required hand-copying
every PromQL expression into a second, Grafana-native rule format because
vanilla OSS Prometheus has no ruler write API for Grafana to manage its rule
files directly. That duplication was flagged as friction #3 in the original
build and is what the operator asked to resolve. Alertmanager reads
Prometheus's native rules directly, so there is only one rule definition per
alert now.

**Templating Alertmanager's config.** Alertmanager's config format has no
native `${VAR}` expansion. Two mechanisms are used together:

- **Secrets, no templating:** `SMTP_PASSWORD` and `WATCHDOG_PING_URL` are
  passed as Compose `secrets:` sourced from the host env vars (`environment:`
  driver, no file on disk), mounted read-only at `/run/secrets/<name>` in the
  `alertmanager` container. Alertmanager's own `smtp_auth_password_file` and
  the webhook receiver's `url_file` config fields read them directly, so
  neither secret ever appears in the rendered plain-text config.
- **envsubst for everything else:** the non-secret fields (SMTP host/port/
  from address, the `to:` address for alerts) have no `_file` equivalent in
  Alertmanager's schema, so a small one-shot `alertmanager-config` service
  (built from `observability/alertmanager/Dockerfile`, which bakes `gettext`
  into the image at build time instead of installing it on every start)
  renders `observability/alertmanager/alertmanager.yml.tmpl` into a shared
  Docker volume with `envsubst` before `alertmanager` starts (`depends_on:
  condition: service_completed_successfully`).

## cAdvisor

Added per operator decision to feed the `lucky-resource-pressure` rule group
(`container_memory_working_set_bytes` / `container_spec_memory_limit_bytes`),
which had no data source in the original P2a build. cAdvisor's `name` label
matches each service's `container_name:` in `docker-compose.yml` (`lucky-bot`,
`lucky-backend`, ...), which is exactly what those rules already matched on,
so no rule expression changes were needed.

## Dashboards (for a non-technical operator)

All tagged `lucky`, cross-linked at the top nav, pt-BR titles and per-panel
descriptions (normal vs worrying). Filters are dashboard variables, so no
panel needs a query typed. Mounted at `/etc/grafana/dashboards` (not nested
under the read-only provisioning mount: Docker cannot create a mountpoint
inside a read-only bind, and Grafana would fail to start).

- **`lucky-home.json` ("Lucky: comece aqui")**: the org home dashboard via
  `GF_DASHBOARDS_DEFAULT_HOME_DASHBOARD_PATH`. "Pergunta → Onde olhar" table
  plus current stats (bot/backend up, active alerts, failed commands, 5xx,
  disk, guilds, active users, tracks played).
- **`lucky-business.json` ("Lucky: negócio")**: Postgres `analytics` views
  only. Guild count and join/leave balance, DAU/WAU/MAU (users and guilds),
  top commands and guilds, music played, top.gg voters, activation (first
  command within 7 days of a join) and D1/D7/D30 membership retention by join
  week. Guild dropdown.
- **`lucky-errors.json` ("Lucky: erros")**: failed commands by command and
  error class, 5xx by route, yt-dlp failures, recap card fallbacks, render
  outcomes, dropped command events, and Loki error/warn logs with level,
  free-text and correlationId filters. Links to Sentry for stack traces.
- **`lucky-metrics.json` ("Lucky: métricas")**: command rate and latency
  (p50/p95/p99, slowest commands), backend rate and p95 per route, render
  rate and duration, Node event-loop lag, CPU and heap.
- **`lucky-health.json` ("Lucky: saúde do sistema")** and
  **`lucky-activation.json` ("Lucky: ativação e uso")**: unchanged.

### Business data: `analytics` schema and `grafana_ro`

`prisma/migrations/20261008160000_analytics_views` creates the `analytics`
schema of aggregate views (no user ids, tokens, message content or payment
payloads; days bucketed in America/Sao_Paulo) and the `grafana_ro` role
(`NOLOGIN`, `USAGE` on `analytics`, `SELECT` on its views, nothing in
`public`, `statement_timeout` 15s, 5 connections). The one-shot
`grafana-db-role` service sets the role's login password from
`GRAFANA_DB_PASSWORD` on every `up`; with the variable unset it does nothing
and only the business panels show a datasource error. `scripts/deploy.sh`
generates `GRAFANA_DB_PASSWORD` into the host `.env` on the first deploy that
finds it missing (an existing value is never changed) and, when the
observability profile is already running, re-applies `grafana-db-role` and
`grafana` so dashboards and the password follow each deploy. The datasource is
`provisioning/datasources/postgres.yaml`. A new view needs its own `GRANT
SELECT ... TO grafana_ro` in the migration that adds it.

## Friction log (P2a gate)

Per the ADR, more than 3 friction points means stop and revisit the platform
choice before P2b. Recorded at build time across both rounds of this PR;
**the operator adds any runtime friction hit when actually bringing the
profile up on the homelab.**

1. **Compose interpolates every service's env vars at parse time, regardless
   of active profile.** A `${GRAFANA_ADMIN_USER:?required}` on the
   profile-gated `grafana` service broke plain `docker compose config`/`up`
   even when `observability` was never requested, because Compose validates
   all services' `environment:` blocks up front. Fixed by using `:-` (empty
   default) instead of `:?` (hard-required); the failure now surfaces at
   Grafana's own startup only when the profile is actually used.
2. **Resolved by adding cAdvisor.** The `lucky-resource-pressure` rule group
   had no data source in the first round of this PR (only node_exporter was
   deployed). Adding the `cadvisor` service and scrape job fixed this; no
   rule expression changes were needed since the `name` label already
   matched `container_name:` values.
3. **Resolved by switching to Prometheus + Alertmanager.** The original
   Grafana-managed alerting required hand-duplicating every PromQL
   expression into a second rule format because vanilla Prometheus has no
   ruler write API. Prometheus evaluates the native `rule_files` and pushes
   firing alerts to Alertmanager, so there is exactly one rule definition
   per alert now.
4. **Local dev environment only, not the platform's fault:** this session's
   local Docker (colima) had a corrupted containerd store (I/O errors on
   blob/metadata reads and writes), so `docker run` for `promtool` and
   `amtool` container checks failed both rounds. Worked around by installing
   `promtool` via Homebrew (`promtool check config` / `check rules` both
   pass) and by rendering + hand-validating the Alertmanager config's YAML
   directly (`amtool check-config` could not run). Filed as a separate
   GitHub issue since it's an environment defect unrelated to this change.
5. **Unverified: the `alertmanager-config` envsubst render.** It was tested
   locally with the real `envsubst` binary against real env vars and
   produces valid YAML (see "Verification" below), but the full chain
   (Compose `secrets:` from env vars mounted at `/run/secrets/*`, the
   one-shot renderer's `depends_on: service_completed_successfully` gate,
   and Alertmanager actually reading `smtp_auth_password_file` / `url_file`)
   was not exercised against a live container this session (blocked by
   friction #4). Verify on first `docker compose --profile observability up
   -d` per the live gate test below.
6. **No true "restart count" metric from cAdvisor for plain Docker
   containers.** That metric only exists for Kubernetes pods (via
   kube-state-metrics). The health dashboard uses "time since last
   container start" (`container_start_time_seconds`) as a practical proxy
   instead: a value that keeps dropping back near zero signals a crash
   loop, even without a literal count.

**Net across both rounds: friction #1 stands, #2 and #3 are resolved by this
round's changes, #4 is a pre-existing local-environment issue (tracked
separately, not the platform's fault), and #5/#6 are new but neither blocks
the prototype** (config and rule checks pass; #6 is a documented
approximation, not a defect). This brings the count of unresolved,
platform-relevant friction down from 4 to effectively 1 (#1) plus one
pending runtime verification (#5); worth another look by the operator
against the ADR's "more than 3" gate, but the trend across this PR is toward
resolving friction, not accumulating it.

## Live gate test checklist (operator, on the homelab)

Run after `docker compose --profile observability up -d` with real `.env`
values:

1. `docker compose --profile observability ps`: `prometheus`, `alertmanager`,
   `grafana`, `node-exporter`, `cadvisor` all `Up`; `alertmanager-config`
   `Exited (0)`.
2. Open Prometheus's targets page (via the same `socat`/SSH-tunnel recipe,
   forwarding to `prometheus:9090` instead of `grafana:3000`) and confirm
   `lucky-bot`, `lucky-backend`, `node-exporter`, `cadvisor`, and
   `prometheus` are all `UP`.
3. Confirm the Watchdog ping reaches healthchecks.io (or whatever
   `WATCHDOG_PING_URL` points at): the check should show a "last ping" within
   the last minute.
4. Fire a synthetic alert and confirm it arrives by email. `amtool` needs
   network access to Alertmanager, which has no host port, so run it in a
   throwaway container on `lucky-network` (same idea as the `socat`
   forwarder above):
   ```sh
   docker run --rm --network lucky-network prom/alertmanager:v0.28.1 \
     amtool alert add alertname=P2aGateTest severity=warning \
     --alertmanager.url=http://alertmanager:9093
   ```
   The synthetic alert resolves almost immediately (no `for:` duration), so
   the expected signal is a "resolved" notification on the `email-primary`
   contact point shortly after the "firing" one. Alternatively, temporarily
   add a rule with `expr: vector(1)` and a different `alertname` to a rules
   file, reload Prometheus, and remove it after confirming the email.
5. Open Grafana ("Lucky: comece aqui" should load as the home dashboard) and
   confirm the disk-free stat panel shows a real percentage matching `df -h`
   on the host.

## What P2b adds next

Per the ADR phase list: Loki + Alloy for log aggregation, gated on P2a passing
and #2386 (single-line JSON logs) being deployed; cutting Lucky out of the
homelab's promtail scrape so logs aren't double-ingested.
