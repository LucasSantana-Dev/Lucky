# ADR 2026-07-01 — Bot monitoring: dead-man-heartbeat-first; logging overhaul deferred

**Status:** Accepted
**Deciders:** Lucas Santana
**Related issues:** #1649 (init failure doesn't exit), #1651 (alertmanager silent drop), #1652 (batch worker silent death), #1646 (skipReason died silently)
**Related:** `decisions/2026-05-24-bot-docker-healthcheck-gateway-signal.md`, `decisions/2026-06-16-info-log-aggregation-loki.md`, homelab ADR-0026 (Watchdog dead-man)
**Trigger:** 2026-07-01 outage — bot zombie 4.5h, operator found out manually despite a complete monitoring stack.

## Context

The 2026-07-01 incident revealed that every monitoring layer existed and still nobody was told:

- Bot init failed on transient boot DNS (`getaddrinfo EAI_AGAIN`, gateway `Opening handshake has timed out`), ran shutdown, **did not exit** → container "Up (unhealthy)" zombie 4.5h (#1649). Docker HEALTHCHECK correctly reported unhealthy; nothing consumes that at runtime.
- Prometheus `LuckyBotDown` fired the entire window; prometheus→alertmanager delivery healthy (389 sent, 0 errors); **alertmanager logged zero notify attempts** for it — unexplained dispatch drop (#1651). `amtool config routes test severity=critical alertname=LuckyBotDown` → `discord-notifications` (routing is correct).
- Both alert channels (alertmanager receiver AND the bot's own `alertEmitter.ts`) are **Discord webhooks — the same failure domain as the monitored service**; the day's DNS failures produced `lookup discord.com on 127.0.0.11:53: i/o timeout` retry storms.
- A Lucky dead-man check **already existed** on the self-hosted healthchecks instance (`agent-lucky-health`, down since 2026-06-30 15:00) — with **`channels: []`**: it notifies nobody.
- Same day, first prod boot of v2.26.0: batch worker died at startup (`BullMQ: Your redis options maxRetriesPerRequest must be null`, #1652) — one log line, no alert. Earlier: skipReason telemetry dead for 18 days through a silent `.catch` (#1646).

Verified scoping facts: bot restart policy is `unless-stopped` (an exiting process WILL be revived); Loki shows exactly 2 "Bot initialization failed" lines in 30 days — both from this single incident (one-off, not chronic); ~60 silent `.catch(()` swallows exist in `packages/bot` (unaudited mix of legit perm-noise and signal-eaters).

The recurring pattern across all four incidents is not bad logging and not chronic crashes — it is **silent failure modes**: components that die or drop signal without telling anyone.

## Decision

**Build the smallest complete "you will always find out" loop now; defer the logging-quality overhaul.**

1. **#1649 — exit on fatal init failure.** After the shutdown routine on init failure, `process.exit(1)`. Restart policy `unless-stopped` revives with backoff. Kills the zombie class at the source.
2. **Dead-man heartbeat (the load-bearing piece).** The bot pings the existing self-hosted healthchecks instance (~60s period, sensible grace) **only while `client.isReady()` is true** — the ping is the health signal, so its absence catches every upstream failure by construction: process dead, init-zombie, post-init gateway drop, prometheus dead, alertmanager dead, Docker DNS dead. No `lucky_bot_gateway_connected` prometheus gauge — the conditional heartbeat is a strict superset (rejected as speculative per-layer duplication).
3. **Non-Discord notification channel** (ntfy push or SMTP email) attached in healthchecks to this check — the alert path must not share the Discord/DNS failure domain of the thing it monitors. Also attach it to the existing `alert-pipeline-deadman`; fix or retire the channel-less `agent-lucky-health`.
4. **#1651 forensics, timeboxed 1–2h.** Synthetic-alert end-to-end dispatch test (`amtool alert add` → Discord receiver). If the drop doesn't reproduce, record as unexplained-transient and rely on layer 2 — the dead-man exists precisely so an alertmanager black hole can't blind us again.
5. **`SENTRY_RELEASE` wiring** in deploy/compose (verified empty in prod; 15-minute fix) so Sentry errors attribute to releases.
6. **End-to-end chaos verification:** stop the bot container's gateway (or the bot) and confirm a non-Discord notification arrives in <5 min. The work is not done until this test passes.

**Deferred — logging-quality track** (structured JSON lines, Correlation Id minting in the bot command error path per CONTEXT.md, audit/classify the 60 `.catch` swallows, pino/OTEL): not incident-driven today; a rebuild without demand evidence violates the measure-first rule.

## Alternatives considered

- **Alert-reliability program incl. gateway gauge + full #1651 root-cause commitment (~2–3 days).** Rejected: gauge is redundant under the conditional heartbeat; open-ended AM forensics may have no trace to find — timebox instead and let the dead-man make the black hole non-blinding.
- **Logging-quality first.** Rejected: would not have prevented or shortened any of the four incidents; all were diagnosable with current logs. Deferred, not discarded.
- **Both as one committed 2-week program.** Rejected: phased-work optimism; Phase 2 rides on no incident evidence. Deferred pieces carry explicit revisit triggers instead.
- **Minimal fix only (#1649 + bare ping).** Rejected as incomplete: without a non-Discord channel it repeats the `channels: []`/failure-domain mistake — the loop must close (ping → alert → human) or it's another silent layer.
- **OTLP/pino platform rebuild.** Rejected: zero incident motivation; demand-blind rebuild.

## Consequences

**Positive:** any bot death or zombie state surfaces in <5 min through a channel that survives Discord/DNS outages; the four observed silent-failure classes each get a structural guard; ~1.5–2 days of work, fits inside the autoplay measurement window (monitoring work is freeze-exempt).

**Negative:** logging debt (unstructured lines, missing bot Correlation Id, 60 unaudited swallows) remains; healthchecks instance becomes alerting-critical infrastructure (it is already the Watchdog dead-man target, so no new SPoF class).

**Neutral:** prometheus/alertmanager/Loki stack unchanged; Discord alerts remain as the rich-notification path.

## Revisit when

- **Next incident where diagnosis is slowed by log quality** (can't trace across services, missing correlation, swallowed signal) → activate the deferred logging track (that incident is the demand evidence).
- **A second alertmanager silent drop** (post-forensics) → escalate AM investigation from timeboxed to root-cause-mandatory; consider replacing the Discord receiver.
- **Heartbeat false-alarms >1/month** (healthchecks flapping on benign restarts/deploys) → tune grace or gate pings differently.
- **Bot gains multi-instance/sharding** → per-shard heartbeat design needed; this ADR assumes one process.
