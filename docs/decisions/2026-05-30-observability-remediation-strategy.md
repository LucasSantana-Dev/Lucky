---
status: accepted
date: 2026-05-30
revisit_after: 2026-06-15
---

# Observability remediation: alert-first minimal, defer OpenTelemetry

## Status

Accepted (decision). Triggered by the `/observability-audit` run on 2026-05-30, which scored Lucky's monitoring **practice** RED while runtime error health was GREEN (256 error events / 30d, 0 in the last 48h; top groups all fixed and quiet post-deploy). The audit surfaced: zero SLOs, zero alert rules, no on-call/paging, dormant OpenTelemetry, and metrics that are shallow on the bot side.

The forcing incident is concrete: the production deploy pipeline was **silently broken for ~5 consecutive deploys over ~1 week** (prisma devDep + esbuild dual-version, fixed in v2.15.2 / #1080). It masked two already-merged fixes from reaching prod and was found by manual inspection — **no signal fired.**

## Context

Lucky is a single-operator, self-hosted (homelab) Discord music bot: 2 runtime services (bot + Express backend) + a React frontend, deployed via `deploy.yml` + Docker to one homelab box. Audited current state:

- **Errors** — Sentry well-wired across all 3 surfaces (PII scrub, env gating, flush-on-shutdown, frontend replay). Volume tiny.
- **Metrics** — `prom-client` /metrics scraped by homelab Prometheus. Backend HTTP rate/latency/errors are good; bot has only a guild-count gauge. A `SimplifiedTelemetry` subsystem exists but is **dead code** (logs only, never invoked).
- **Logs** — custom structured logger, correlation IDs, secret redaction → stdout + Sentry breadcrumbs. Not centralized.
- **Traces** — OpenTelemetry is a **transitive dep only, fully dormant** (no SDK init). Only Sentry tracing @ 10%.
- **Already running on the homelab** — Grafana + Prometheus, a Healthchecks instance (homelab PR #87, **on-box**), and Discord as the notification channel.
- **LLM observability (Langfuse)** — correctly absent; recs are Spotify/LastFM/heuristic, no LLM generation path.

The question:

> What is the right NEXT observability investment, and what do we explicitly defer?

## Research

### Options considered (Phase 1)

| Option                              | What it adds                                                                                                                      | Operator time | Catches the deploy incident?                                          |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------- | --------------------------------------------------------------------- |
| **A. Alert-first minimal** (chosen) | SLO + symptom burn-rate alert via existing Grafana → Discord; version-aware heartbeat; Sentry release markers + source-map upload | ~5h           | **Yes** (release markers + version heartbeat)                         |
| **B. Full OpenTelemetry**           | Wire dormant OTel SDK, auto-instrument http/express/prisma/redis, distributed traces to a homelab collector                       | 40–50h        | **No** (traces don't prove the running code matches the deployed tag) |
| **C. Defer / no change**            | nothing                                                                                                                           | 0h            | No — incident recurs                                                  |
| **D. Subtract only**                | remove dead `SimplifiedTelemetry` + transitive OTel                                                                               | ~2h           | No — necessary but insufficient                                       |

Two independent research passes (SRE sequencing + homelab alerting tooling) converged:

- **Sequencing:** Google SRE doctrine favors alerting on user-visible **symptoms** via burn-rate tied to an SLO over raw thresholds; pillar order is metrics → logs → traces. Distributed-tracing ROI turns positive around **5+ interdependent services** / frequent multi-hour root-cause incidents — below that it is premature, with self-hosted tracing carrying real operational overhead. (sre.google SRE book + workbook; Observability Engineering, O'Reilly; OTel 2026 maturity guidance.)
- **Tooling:** **Grafana unified alerting** = zero new infra (already running), YAML-provisionable, native Discord, supports multi-window burn-rate. Alertmanager is duplicative given Grafana. Sentry alerts are event-based, not burn-rate. A **liveness heartbeat is structurally required** — a metrics alert cannot fire if Prometheus/Grafana/the box itself is down. (Grafana alerting docs; Alertmanager Discord support; Prometheus burn-rate design.)

### Critique (Phase 2 — `critic`, Opus)

The critic **accepted Option A** (did not flip the winner) but added one MAJOR reframe and several gaps, all accepted:

1. **Deploy-success detection is a separate, prerequisite layer.** The silent-deploy incident is orthogonal to metrics/logs/traces. Only Sentry release markers ("release deployed but events stopped from that release") + a **version-aware heartbeat** (bot reports its running version; alert on mismatch vs deployed tag) catch it. **Option B does not catch it** — the bot could emit perfect traces while running stale code. This makes the layering explicit (below) and sets the in-A sequencing: heartbeat → release markers → burn-rate alert.
2. **On-box Healthchecks blind spot.** The homelab Healthchecks instance is on the same box (PR #87); a full-box reboot kills Healthchecks too. Add **one external heartbeat** (healthchecks.io free tier / UptimeRobot) for the top-level "box reachable at all" signal — an independent failure domain.
3. **Don't set the SLO from first principles.** Define it after **14 days of observed availability** + operator tolerance; the binary heartbeat and a 5-minute error-rate burn need no SLO to start.
4. **Tuning window + runbook** are missing: first ~7 days are threshold-tuning; add a 1-paragraph runbook for "release deployed but bot still on old version."

### Why not Option B (now)

40–50h of operator time (SDK init, Prisma has no native OTel spans, collector setup/retention, span schema, trace-reading skill) for a system with **no multi-service request flow** (bot is async-only; backend↔bot is a status read; longest chain ≈ browser→backend→Prisma ≈ ms), no reported latency problem, and no distributed mystery. The ROI bar — "a trace saved ≥40h of debugging in the last 6 months" — has not been hit. And it would not have caught the forcing incident.

## Decision

Adopt **Option A**, structured as explicit layers (1–3 required now; 4 deferred):

```
Layer 1 (deploy)   — Sentry release create/finalize in deploy.yml + CI source-map upload   REQUIRED
Layer 2 (liveness) — version-aware heartbeat via on-box Healthchecks + 1 external heartbeat  REQUIRED
Layer 3 (runtime)  — error-rate / burn-rate alert via existing Grafana → Discord            REQUIRED
Layer 4 (latency)  — OpenTelemetry distributed tracing                                       DEFERRED → 2026-06-15
```

In-sequence (the critic's order):

1. **Heartbeat first** (binary, no tuning): bot/backend POST to Healthchecks on a startup hook + interval, embedding the running version in the ping; Healthchecks → Discord on miss (timeout 60–90s). Add one external heartbeat for full-box-down.
2. **Sentry release markers + source-map upload** in `deploy.yml` (`sentry-cli releases create` pre-deploy, `finalize` after the service reports its version). Closes the silent-deploy class.
3. **Burn-rate / error-rate alert** in Grafana on `lucky_backend_http_server_errors_total` → Discord. Measure backend errors/day for ~3 days first; treat the first ~7 days as a tuning window. **Define the availability SLO after 14 days of observed data**, not up front.
4. **Defer OpenTelemetry (Layer 4)** to the 2026-06-15 decision point; do not adopt until one revisit trigger fires.
5. **Delete dead `SimplifiedTelemetry`** in a separate PR after Layer 1–3 are validated (not bundled — avoid debugging two things at once).

This is a plan, not yet applied; implementation is gated on a separate go-ahead.

## Consequences

### Positive

- The silent-deploy incident class is directly closed (release markers + version heartbeat) — the one thing OTel would not have caught.
- ~5h of work, zero new infra, zero new credentials (reuses Sentry, Grafana, Healthchecks, Discord). Fully reversible — every piece is swappable in 1–2h.
- Two independent notification domains (Grafana/Prom path + Healthchecks path) so a failure in one is still surfaced by the other.
- "0 errors" stops being luck and becomes signal: silence now means the heartbeat is alive, not that monitoring died.

### Negative

- No distributed latency attribution until Layer 4. If a cross-service latency mystery appears before 2026-06-15, diagnosis falls back to logs + metrics (acceptable at current complexity).
- Burn-rate alerts on a low-volume system are prone to early false positives; the 7-day tuning window is mandatory toil.
- Dead-code removal is deferred to a follow-up PR, so `SimplifiedTelemetry` lingers a little longer.

### Neutral

- Sentry tracing @ 10% is kept as-is (useful, already paid for).
- The transitive OTel dependency is left in place (removing it buys ~nothing); only direct/unused OTel deps, if any, are pruned in the cleanup PR.

## Revisit when

**Flip to Option B (adopt OpenTelemetry)** if ANY of these is true by **2026-07-15**:

1. A latency complaint, or backend P95 > 1s (measured), with cause unclear from logs + metrics.
2. ≥1 incident requiring causality across bot ↔ backend ↔ frontend to diagnose.
3. The operator explicitly wants request-flow visibility (curiosity → operational need).
4. A third runtime service (worker / cache / queue) is added so request chains span processes.
5. The operator explicitly has 40+h available for observability this quarter.

**Decision point 2026-06-15** (`revisit_after`): after ~2 weeks of Layers 1–3 live, ask "have we caught anything, and do we still lack visibility we need?" Decide Layer 4 from that data.

**Do the `SimplifiedTelemetry` cleanup independently** once Layers 1–3 are validated, or fold it into a scheduled tech-debt PR.

## Alternatives rejected (summary)

- **B — Full OpenTelemetry** — 40–50h for ~zero current ROI at 2 services with no distributed request path; does not catch the forcing incident. Deferred, not killed.
- **C — No change** — the silent-deploy failure is structural and recurs without instrumentation.
- **D — Subtract only** — removing dead telemetry is necessary but does not add detection; folded into A as a follow-up rather than chosen alone.

## Open implementation caveats (from critic)

- Confirm the external heartbeat is genuinely off-box (the on-box Healthchecks reboots with the box).
- Measure backend errors/day for ~3 days before setting burn-rate thresholds.
- `deploy.yml` is automated, so the `sentry-cli` release + source-map steps are a few lines; finalize the release **after** the service reports its running version.
- Write the 1-paragraph "release deployed but bot on old version" runbook alongside Layer 1.

## Related

- `/observability-audit` (2026-05-30, this session) — the RED-practice verdict that forced this decision.
- [[2026-05-24-deploy-bot-health-gate]] and [[2026-05-24-bot-docker-healthcheck-gateway-signal]] — existing deploy/liveness gates this builds on.
- [[2026-05-19-queue-resolver-defensive-fallback-chain]] — same defer-pending-data shape (decide later with telemetry, explicit revisit trigger).
- [[2026-05-16-trivy-image-scan-vs-snyk-in-ci]] — same audit-then-promote, lowest-friction-given-existing-infra reasoning.
- [[2026-05-21-autoplay-recommendation-roadmap]] — domain telemetry (Recommendation/TrackHistory), distinct from this operational-observability decision.
- Incident: deploy silently broken ~5 deploys, fixed v2.15.2 / #1080 (2026-05-28) — the forcing event.
