# Info/usage log storage: self-hosted Grafana Loki, adopted via a measurement-gated pilot

- Status: accepted (adopt Loki; pilot gated on a log-volume measurement + a label-cardinality guard)
- Date: 2026-06-16

## Context

Today only errors/warnings are durable (Sentry). The request was to "store more
logs — info, usage, metrics, statistics." Grounding that against the codebase
splits it into three concerns with two already solved:

- **Metrics / statistics — already solved.** `prom-client` is wired in both
  `packages/backend` (`utils/prometheus.ts`, `/metrics` route) and `packages/bot`
  (`utils/monitoring/metricsServer.ts`) — 200+ counters/gauges — scraped by the
  homelab Grafana/Prometheus. "Usage statistics" (play counts, command rates)
  belong here as counters, **not** as logs.
- **Errors / warnings — already solved.** Sentry (`@sentry/node`, breadcrumbs).
- **Info logs — the actual gap.** `utils/general/log` emits at default
  `LOG_LEVEL=2` (INFO; verified `config/environment.ts:199`) to **stdout**, which
  is ephemeral. 144 `infoLog` call-sites produce no searchable trail. There is a
  scoped `ServerLog` Postgres table + `ServerLogService` powering a web "Server
  Logs" UI (#965), but Postgres (Supabase sa-east-1, modest tier) is the wrong
  place for general high-volume logs.

Trigger: the 2026-06-16 bot incident (auto-join #1467 + play errors #1468) — Sentry
showed the errors but there was no queryable INFO trail to reconstruct the sequence
(extractor registration, session restore, command flow).

Constraints specific to this stack:

- **Disk-constrained homelab** (internal disk near capacity; bulk data must live on
  attached storage). High-volume logs on the box are a real risk.
- **Single operator** — low tolerance for ops-heavy infra; a broken log store must
  not take down the bot.
- **Grafana + Prometheus already run on the homelab** — a logs backend that reuses
  that pane is strongly preferred.
- **Actual INFO log volume is UNMEASURED.**

## Decision

Adopt **Grafana Loki, self-hosted on the homelab**, shipping container stdout via
**Grafana Alloy**, as the store for INFO (and usage-context) logs. Keep Sentry for
errors/warnings and Prometheus for metrics/statistics. Keep the `ServerLog` Postgres
table only for its scoped web-UI purpose — do **not** grow it into the general log
store.

This is gated and guarded per the `decision-critic` REVISE (the decision is sound
but the disk math was speculative and label-cardinality was an unguarded foot-gun):

**Pilot plan (sequenced):**

1. **Measure first (gate).** Before standing up Loki, measure real INFO volume on
   the homelab over a representative window covering **both a busy and an idle
   period** (e.g. `docker logs` byte counts, or a day's rotated log size). This is
   the load-bearing unknown — do not size retention on a guess. (Mirrors the repo's
   measure-demand-before-rebuild rule.)
2. **Cardinality guard (mandatory before shipping at scale).** Alloy ships a FIXED
   low-cardinality label set only — `service`, `level`, `env`. High-cardinality
   fields (`guildId`, `requestId`, `trackId`, `userId`) stay in the structured JSON
   **body**, never as Loki labels. Add a guard so drift is caught: a cardinality
   check/alert (Prometheus on Loki's label metrics) or an Alloy relabel allowlist.
3. **Stand up Loki** with its data dir on attached storage, bounded retention
   (start ~14–30d), compactor enabled, and a **disk-usage alert at ~80%** so a full
   disk can't silently break logging during an incident.
4. **Pilot success criteria:** (a) reconstruct the 2026-06-16 incident timeline by
   querying INFO logs in Grafana; AND (b) measured daily volume × retention fits the
   attached-disk budget with margin.

**Contingency (explicit trigger):** if measured/projected volume makes self-hosted
retention infeasible on the homelab disk, OR Loki ops prove too costly for one
operator, ship logs **off-box to Axiom** (free tier ~500GB/mo, 30d, zero-ops). If
volume also exceeds Axiom's free ceiling, drop INFO retention / sample before paying.

## Alternatives considered

- **Sentry Logs** — SDK already present, but priced/designed for error _context_
  (~5GB/mo free then $0.50/GB) and has no native Grafana datasource; bulk INFO flips
  the bill and splits the pane. Rejected for the general store (fine to keep Sentry
  for errors).
- **Postgres `ServerLog` as the general store** — bloat/vacuum/cost on a modest
  Supabase tier; wrong tool at volume. Rejected; ring-fenced to the web UI.
- **OpenSearch/ELK** — full-text power at ~2–3× Loki's disk + JVM ops. Overkill for
  one operator on a constrained box.
- **ClickHouse** — best compression/retention, but cluster ops are overkill unless
  storing years of logs.
- **Better Stack free tier** (3GB/3d) — too small to be useful.
- **Grafana Cloud free** (50GB/14d) — tempting (native), but 14d retention is short
  and it nudges the whole stack toward a vendor; kept as a secondary SaaS option.
- **Axiom free tier** — strong; chosen as the off-box CONTINGENCY rather than the
  default, to avoid a new vendor + data egress while self-host is viable.
- **Do nothing (stdout + logrotate + grep)** — no dashboards/alerts/structured
  search; under-powered for incident archaeology, which is the whole point.

## Consequences

- **Positive:** single pane with existing metrics; free + self-hosted (no new vendor
  or data egress); logs stay on the producing box; disk bounded by retention +
  attached storage + a fixed label set; reversible (Alloy can re-point to Axiom).
- **Negative:** Loki is one more self-hosted service for a single operator
  (restarts, config, compaction); label-cardinality discipline must be enforced
  (guard added) or disk silently balloons; no HA — if Loki is down during an
  incident, that incident's INFO trail is lost (acceptable at hobby scale; mitigated
  by the disk alert + keeping stdout/Sentry as out-of-band paths).
- **Neutral:** retention window (14–30d) is a tunable trade, revisited after the
  volume measurement.

## Revisit when

- The volume measurement comes back: if daily volume × retention doesn't fit the
  attached-disk budget → switch to the Axiom contingency before scaling up.
- Label cardinality drifts (guard fires) → fix the label set, don't raise disk.
- The bot's guild count grows materially (volume scales with activity) → re-measure
  and re-evaluate self-host vs. Axiom.
- Loki ops burden proves too high for one operator over ~3 months → move to Axiom /
  Grafana Cloud.
