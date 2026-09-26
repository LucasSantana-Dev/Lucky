# Lucky observability stack (P2a prototype)

Phase P2a of `decisions/2026-09-26-lucky-owned-observability-stack.md`: Prometheus +
Grafana, provisioned entirely from files, running as the `observability` Compose
profile alongside the app. See issue #2392.

## Run it

```sh
docker compose --profile observability up -d
```

This starts `prometheus`, `grafana`, and `node-exporter` in addition to whatever
other profile(s)/services you already run. None of them bind a host port.

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
  alpine/socat TCP-LISTEN:3000,fork TCP:grafana:3000
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

All read from `.env` (not committed; see `.env.example` at the repo root, which
this PR does not modify since it is treated as secret-bearing).

| Var | Used by | Purpose |
| --- | --- | --- |
| `GRAFANA_ADMIN_USER` | grafana | Initial admin username (`GF_SECURITY_ADMIN_USER`). |
| `GRAFANA_ADMIN_PASSWORD` | grafana | Initial admin password (`GF_SECURITY_ADMIN_PASSWORD`). |
| `ALERT_EMAIL_TO` | grafana (contact point `email-primary`) | Where non-Watchdog alerts land. |
| `WATCHDOG_PING_URL` | grafana (contact point `watchdog-offbox`) | Off-box healthchecks.io (or similar) ping URL. The Watchdog alert (always firing) hits this every minute; losing the ping is the alarm. |
| `SMTP_HOST` | grafana | SMTP server host for `email-primary` (Grafana's `GF_SMTP_HOST`, combined with `SMTP_PORT`). |
| `SMTP_PORT` | grafana | SMTP port, default `587`. |
| `SMTP_USER` | grafana | SMTP auth username. |
| `SMTP_PASSWORD` | grafana | SMTP auth password. |
| `SMTP_FROM_ADDRESS` | grafana | "From" address on alert emails. |
| `HEARTBEAT_PING_URL` | bot, backend | On-box dead-man ping target (issue #2390). |
| `HEARTBEAT_PING_URL_EXTERNAL` | bot, backend | Off-box dead-man ping target (issue #2390). |
| `HEARTBEAT_INTERVAL_MS` | bot, backend | Heartbeat interval, default `60000`. |

None of the above are read by this PR's code from any `.env*` file directly;
they're consumed at container-start time by Compose/Grafana/the app.

## Alerting choice: Grafana-managed alerting, not a separate Alertmanager

The task allowed either "Grafana alerting (unified) evaluates the Prometheus
rules" or "run Alertmanager." We picked **Grafana-managed alert rules**
(`observability/grafana/provisioning/alerting/rules.yaml`) over adding an
Alertmanager container:

- **Fewer moving parts.** One less container, one less `mem_limit` to budget
  against the 8 GB host floor the ADR sets, one less config surface to keep
  in sync with contact points/routing.
- **Grafana is already the single pane** per the ADR (§2, §4): dashboards,
  contact points, and notification policies all live in Grafana regardless;
  having it also own alert evaluation avoids a second alerting engine.
- **Vanilla OSS Prometheus has no ruler write API** (that's a Mimir/Cortex/Loki
  feature), so Grafana cannot treat our Prometheus as a "data source-managed"
  ruler and pull `observability/prometheus/rules/*.yml` in directly. The
  practical file-provisioned path is to re-express the same PromQL as
  Grafana-managed alert rules querying the `prometheus` datasource, which is
  what `rules.yaml` does: each rule's expression is copied from the matching
  Prometheus rule.

**Trade-off, disclosed:** Prometheus still loads `observability/prometheus/rules/*.yml`
via `rule_files` (so `/api/v1/rules`, `promtool check rules`, and a future
migration to Alertmanager/Mimir all still work), but with no `alerting:
alertmanagers:` configured, Prometheus's own evaluation of those rules is
inert (computed, never delivered). The rules that actually fire and notify are
the separate Grafana-managed copies. The two must be kept in sync by hand;
that's a real cost against the "everything is code" goal to revisit when this
graduates past the prototype.

## Friction log (P2a gate)

Per the ADR, more than 3 friction points means stop and revisit the platform
choice before P2b. Recorded here at build time; **the operator adds any
runtime friction hit when actually bringing the profile up on the homelab.**

1. **Compose interpolates every service's env vars at parse time, regardless
   of active profile.** A `${GRAFANA_ADMIN_USER:?required}` on the
   profile-gated `grafana` service broke plain `docker compose config`/`up`
   even when `observability` was never requested, because Compose validates
   all services' `environment:` blocks up front. Fixed by using `:-` (empty
   default) for the new Grafana/alerting vars instead of `:?` (hard-required);
   the failure now surfaces at Grafana's own startup only when the profile is
   actually used, not for every unrelated `compose up`.
2. **cAdvisor-dependent rules have no data source in P2a.** The
   `lucky-resource-pressure` group moved from `monitoring/prometheus/` reads
   `container_memory_working_set_bytes` / `container_spec_memory_limit_bytes`,
   which come from cAdvisor. P2a only deploys node_exporter. Those four rules
   stay defined (portable) but are dormant: no series, no alert, until
   cAdvisor is added in a later phase.
3. **Vanilla Prometheus has no ruler API for Grafana to manage its rule files
   directly** (see "Alerting choice" above), forcing the same alert logic to
   be hand-duplicated between `observability/prometheus/rules/*.yml`
   (Prometheus-native, inert for delivery) and
   `observability/grafana/provisioning/alerting/rules.yaml` (Grafana-managed,
   the one that actually notifies).
4. **Unverified assumption: Grafana's `${VAR}` provisioning-file environment
   expansion.** The contact points in `contactpoints.yaml` reference
   `${ALERT_EMAIL_TO}` and `${WATCHDOG_PING_URL}`, expecting Grafana to expand
   them from the container's environment at provisioning-load time (a
   documented Grafana feature). This was **not verified against a running
   Grafana container in this session** (see friction #5). Verify on first
   `docker compose --profile observability up -d`, and if the values come
   through literally instead of expanded, switch to an entrypoint `envsubst`
   pass over the alerting YAML before Grafana starts.
5. **Local dev environment only, not the platform's fault:** this session's
   local Docker (colima) had a corrupted containerd store (I/O errors on
   blob/metadata reads and writes), so `docker run` for a `promtool` container
   check failed. Worked around by installing `promtool` via Homebrew instead
   (`brew install prometheus`) and running `promtool check config` /
   `promtool check rules` directly against the files, and both passed. Filed as
   a separate GitHub issue since it's an environment defect unrelated to this
   change.

**4 of the 5 are platform-relevant** (friction #5 is local-environment noise,
not a Prometheus/Grafana platform concern), and that crosses the ADR's "more than
3" threshold. Flagging this explicitly for the operator to weigh against
proceeding to P2b; nothing here is a hard blocker for the prototype itself
(`docker compose --profile observability config` and `promtool check` both
pass), but per the ADR's own gate this is a signal to pause and re-evaluate
before committing further to this stack.

## What P2b adds next

Per the ADR phase list: Loki + Alloy for log aggregation, gated on P2a passing
and #2386 (single-line JSON logs) being deployed; cutting Lucky out of the
homelab's promtail scrape so logs aren't double-ingested.
