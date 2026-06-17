# Info/usage log storage: self-hosted Grafana Loki, adopted via a measurement-gated pilot

- Status: accepted (adopt Loki) — **implemented; the "stand up Loki" plan was largely moot, see the 2026-06-16 update below**
- Date: 2026-06-16

## Update (2026-06-16) — homelab reality reversed the build plan

Once homelab SSH access was available, inspection of the box reversed the plan's
premise (the same "verify before building" lesson as the YouTube ADR):

- **Loki + promtail + Grafana + Prometheus were already running** (6+ days uptime).
  promtail already scrapes every container's logs to Loki, so **the lucky INFO logs
  were already in Loki** — the "ephemeral stdout only" premise was false. No Alloy
  needed; no greenfield stand-up.
- **Retention was already 30 d** (`720h`) and **disk alerts already existed**
  (`LowDiskSpace` <20% free, `CriticalDiskSpace` <10%). The ADR's measure-first /
  retention / alert items were already satisfied.

The real, verified gaps were two bugs, both now fixed:

1. **Loki persistence (P1 data loss).** Loki wrote to `/tmp/loki` (the ephemeral
   container layer) while the persistent bind mount `appdata/loki → /loki` sat unused
   (root-owned, unwritable by Loki's uid 10001 — that's why someone redirected to the
   writable `/tmp`). On any container _recreate_ all logs were lost. Fixed: chown the
   bind dir to 10001, migrate data, repoint config to `/loki`, restart. SoT in
   homelab PR #191. This is what actually delivered success criterion (c) "survives
   restart/redeploy."
2. **No stable log identity.** `container_name` was empty because the json-file
   driver only emits `attrs.tag` when given a `tag` log-opt, and the lucky services
   set none — so logs were findable only by ephemeral container-id `filename`. Fixed
   by adding `tag: "{{.Name}}"` to each service's `logging.options`
   (Lucky #1476, merged) → promtail's existing `attrs.tag → container_name`
   extraction now populates `{container_name="lucky-bot"}` etc.

Measured volume (with labels working): ~172 MB/day across **all** containers;
lucky-bot+backend ~5k lines/day idle; Loki's own data dir is ~311 MB. The host disk
sits at 88% but **not because of logs** — so 30 d retention is comfortable and going
to 90 d (≈+15 GB onto an 88% disk) is the wrong move. The "size to disk, don't keep
forever" reasoning holds; 30 d stays.

Net: the decision (self-hosted Loki, single Grafana pane, low-cardinality labels) was
right, but the _work_ was fixing two config bugs in an existing stack, not building a
new one. Alloy was unnecessary — promtail already does the job.

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

- **Logs must stay on the homelab and always be available** (operator requirement,
  2026-06-16). The store is a permanent, always-running homelab service — not the
  current ephemeral `json-file` rotation (10 MB × 3 ≈ last 30 MB/container, then
  discarded) and **not** an off-box SaaS. This makes self-hosted Loki the firm
  choice and demotes any SaaS to emergency-only.
- **"Always up" ≠ infinite retention.** Always-running + always-queryable is the
  requirement; _keeping every log forever_ is not achievable on finite disk. So
  retention is a **bounded window sized to the homelab log-disk budget**: choose the
  longest window the disk allows (target 90 d if it fits; otherwise
  `disk_budget ÷ daily_volume`). The log service stays up; the _oldest_ logs roll
  off via retention/compaction.
- **Disk discipline.** The homelab log-disk budget is the key variable; the data dir
  goes on the largest available volume. High-cardinality labels would balloon it
  (guarded below).
- **Single operator** — low tolerance for ops-heavy infra; the log store must run
  with `restart: unless-stopped`, and must fail safe (drop oldest logs, never crash
  the bot or fill the disk silently).
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
3. **Stand up Loki as a permanent service** — `restart: unless-stopped`, data dir on
   the largest homelab volume, compactor enabled, retention set to the longest
   window the log-disk budget allows (target 90 d; floor ~30 d), and a
   **disk-usage alert at ~80%**. Retention/compaction (not a crash) is what bounds
   disk, so the service stays up and only the oldest logs roll off.
4. **Pilot success criteria:** (a) reconstruct the 2026-06-16 incident timeline by
   querying INFO logs in Grafana; (b) measured daily volume × chosen retention fits
   the log-disk budget with margin; AND (c) Loki survives a bot restart/redeploy and
   a host reboot (logs remain queryable — "always up").

**Last-resort only (not the default):** the operator requires logs on the homelab,
so SaaS is **emergency-only** — used solely if the homelab cannot host the store at
all (e.g. no disk available). In that case ship off-box to **Axiom** (free
~500 GB/mo, 30 d); exceed that ceiling → sample / shorten retention before paying.
This is a fallback of last resort, not the planned path.

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
- **Neutral:** retention window (target ~90 d, floor ~30 d) is a tunable trade set
  by the log-disk budget after the volume measurement; "always up" is the service +
  query availability, not unbounded history.

## Revisit when

- The volume measurement comes back: if daily volume × target retention doesn't fit
  the homelab log-disk budget → keep it on-box by **shortening retention or adding a
  bigger volume** first (the on-homelab requirement); off-box SaaS only if the box
  genuinely can't host it.
- Label cardinality drifts (guard fires) → fix the label set, don't raise disk.
- The bot's guild count grows materially (volume scales with activity) → re-measure
  and re-tune retention/disk on the homelab.
- Loki ops burden proves too high for one operator over ~3 months → re-open the
  on-box-vs-SaaS question (only then does the emergency SaaS fallback become a real
  candidate).
