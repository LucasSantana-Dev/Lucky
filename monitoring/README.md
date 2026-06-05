# Lucky — monitoring

Observability remediation, Layers 1–3 (see
[`decisions/2026-05-30-observability-remediation-strategy.md`](../decisions/2026-05-30-observability-remediation-strategy.md)).

Everything here is **no-op-by-default**: the code/CI changes activate only when the
corresponding secrets/URLs are configured, so this PR is safe to merge before any
external wiring is done. This file lists the manual steps that remain.

## Layer 1 — deploy-success detection (Sentry releases + frontend source maps)

**Wired in this repo:** `deploy.yml` creates + finalizes a Sentry release keyed on the
deployed commit SHA (the same value the app already tags via `SENTRY_RELEASE`/`COMMIT_SHA`);
`packages/frontend/vite.config.ts` uploads source maps via `@sentry/vite-plugin`.

**Manual steps (one-time):**

1. Create a Sentry **internal integration / auth token** with `project:releases` +
   `org:read` scope (org `lucas-santana-gm`, project `lucky`).
2. Add it as a secret named `SENTRY_AUTH_TOKEN`:
   - **GitHub Actions** → repo Settings ▸ Secrets and variables ▸ Actions (drives the
     `deploy.yml` release markers).
   - **Vercel** → project env, Production scope (drives frontend source-map upload at
     `vite build`).
3. (Optional) Override org/project via repo **variables** `SENTRY_ORG` / `SENTRY_PROJECT`;
   defaults are `lucas-santana-gm` / `lucky`.

Until the token exists, the `Sentry release — create/finalize` steps are skipped
(`if: env.SENTRY_AUTH_TOKEN != ''`) and the Vite plugin is not added — builds are
byte-identical to today.

**What it buys:** Sentry attributes errors to a release and can flag "release deployed
but events stopped" — the class of failure that hid the v2.15.x silent-deploy incident.

## Layer 2 — liveness heartbeat

**Wired in this repo:** bot and backend call `startHeartbeat()` (shared module
`packages/shared/src/utils/monitoring/heartbeat.ts`). Each posts to the configured
monitor on startup and every `HEALTHCHECK_INTERVAL_MS` (default 60s), with the running
version in the ping body. No-op when no URL is set.

**Runtime env vars** (set in the deployed `.env` — `.env.example` is intentionally not
edited here as it is treated as secret-bearing):

| Var | Purpose |
| --- | --- |
| `HEALTHCHECK_URL` | On-box Healthchecks ping URL (homelab PR #87). Catches "service died, box alive". |
| `HEALTHCHECK_URL_EXTERNAL` | **Off-box** monitor (healthchecks.io free / UptimeRobot). Catches a full homelab reboot that also kills the on-box monitor. |
| `HEALTHCHECK_INTERVAL_MS` | Ping interval (default `60000`). Keep below the monitor's period+grace. |

**Manual steps:**

1. Create two checks (one per service, or one shared) on the **on-box** Healthchecks
   instance; set period ≈ 60s and grace ≈ 30–60s; route the check's alert to Discord.
2. Create one **off-box** check (healthchecks.io free tier or UptimeRobot) and set its
   URL as `HEALTHCHECK_URL_EXTERNAL`.
3. Add the URLs to the bot/backend runtime env.

## Layer 3 — symptom alerts on metrics

**Provided in this repo:** [`prometheus/lucky-alerts.rules.yml`](prometheus/lucky-alerts.rules.yml)
— portable PromQL alert definitions (backend 5xx error-ratio warning + fast-burn
critical; backend/bot scrape-down). These are **definitions only**; the homelab owns
the Prometheus/Grafana config, so they are not auto-loaded.

**Manual steps (recommended path — Grafana unified alerting, already running):**

1. In Grafana, add a **Discord contact point** (incoming webhook for the alerts channel).
2. Recreate these rules as Grafana-managed alerts against the Prometheus datasource, OR
   load the file into the homelab Prometheus `rule_files` and route via Alertmanager
   `discord_configs`. Adjust the `job=...` labels to match your `scrape_configs`.
3. Measure backend errors/day for ~3 days, then tune the thresholds (first ~7 days are a
   tuning window).

Per the ADR, the availability **SLO** and a proper multi-window burn-rate are defined
**after ~14 days** of observed data — these starter alerts come first.

## What this does NOT do (by design)

- No OpenTelemetry / distributed tracing — deferred to the 2026-06-15 decision point.
- No dashboards-as-code yet — committing the homelab Grafana dashboards into this repo
  is the follow-up that makes the audit's orphan-metric / broken-panel questions
  answerable.
