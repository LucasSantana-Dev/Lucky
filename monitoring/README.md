# Lucky — monitoring

Observability remediation, Layers 1–3 (see
[`decisions/2026-05-30-observability-remediation-strategy.md`](../decisions/2026-05-30-observability-remediation-strategy.md)).

> Layer 3's Prometheus rules and the Grafana provisioning follow-up now live in
> [`observability/`](../observability/), Lucky's owned, fully file-provisioned
> stack (Prometheus + Grafana; see
> [`decisions/2026-09-26-lucky-owned-observability-stack.md`](../decisions/2026-09-26-lucky-owned-observability-stack.md)).
> This file stays for Layers 1 and 2 (Sentry releases, heartbeat).

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
monitor on startup and every `HEARTBEAT_INTERVAL_MS` (default 60s), with the running
version in the ping body. No-op when no URL is set. The bot passes an `isReady`
gate so a disconnected gateway goes silent instead of pinging (issue #2390).

**Runtime env vars** (set in the deployed `.env` — `.env.example` is intentionally not
edited here as it is treated as secret-bearing):

| Var | Purpose |
| --- | --- |
| `HEARTBEAT_PING_URL` | On-box Healthchecks ping URL. Catches "service died, box alive". |
| `HEARTBEAT_PING_URL_EXTERNAL` | **Off-box** monitor (healthchecks.io free / UptimeRobot). Catches a full homelab reboot that also kills the on-box monitor. |
| `HEARTBEAT_INTERVAL_MS` | Ping interval (default `60000`). Keep below the monitor's period+grace. |

**Manual steps:**

1. Create two checks (one per service, or one shared) on the **on-box** Healthchecks
   instance; set period ≈ 60s and grace ≈ 30–60s; route the check's alert to Discord.
2. Create one **off-box** check (healthchecks.io free tier or UptimeRobot) and set its
   URL as `HEARTBEAT_PING_URL_EXTERNAL`.
3. Add the URLs to the bot/backend runtime env.

## Layer 3 — symptom alerts on metrics

**Moved to [`observability/prometheus/rules/lucky-alerts.rules.yml`](../observability/prometheus/rules/lucky-alerts.rules.yml)**
(ADR 2026-09-26, phase P2a). Auto-loaded by Lucky's own Prometheus in the
`observability` Compose profile; see [`observability/README.md`](../observability/README.md)
for how to run it and how the alerts are actually delivered (Grafana-managed
alerting, not a separate Alertmanager).

## What this does NOT do (by design)

- No OpenTelemetry / distributed tracing — deferred to the 2026-06-15 decision point.
- No dashboards-as-code yet — committing the homelab Grafana dashboards into this repo
  is the follow-up that makes the audit's orphan-metric / broken-panel questions
  answerable.
