# ADR 2026-07-02 — Resource hygiene: alert calibration first, allocation second, no app-efficiency work

**Status:** Accepted
**Deciders:** Lucas Santana
**Related:** #1657 (alert noise findings), #1651 (outage alert unseen), `decisions/2026-07-01-bot-monitoring-dead-man-first.md`, homelab ADR-0036 (host config git-first)
**Trigger:** operator request "resources optimization" (2026-07-02). Intent was not further specified; this ADR records the interpretation chosen: _resource hygiene_ — signals, allocation, and disk — selected because measurement showed no consumption problem to optimize.

## Context

All numbers verified live 2026-07-02:

- **No consumption pressure.** Host 14Gi: 10Gi available, swap idle, disk 62%. Every container under its `mem_limit`. Bot: 231MB RSS / 1G; V8 heap 132.8MB used vs `heap_size_limit` 560MB → 24% true utilization. 14-day heap trend `[119,131,144,145,143,151,135,143,130]` MB — oscillating, no growth, no leak.
- **Broken resource signals, 23:1 noise:signal (15-day firing-minutes).** `LuckyBotHeapHigh` 7,370 min — expr `nodejs_heap_size_used/nodejs_heap_size_total > 0.9` is broken by design (V8 grows `heap_total` lazily; healthy processes idle at 92–96%). `HighMemoryUsage`+`Critical` 5,405 min — expr uses `container_memory_usage_bytes`, which includes page cache, so IO-heavy containers (healthchecks 84.7% by usage vs 77.9% working-set; kopia during snapshots) alert on cache, not pressure. Real signal `LuckyBotDown`: 551 min, drowned. Chronic noise is a plausible contributor to the 2026-07-01 outage alert going unnoticed (#1651).
- **Real allocation items.** `healthchecks` at 399MB working-set / 512MB limit — now alerting-critical infrastructure (dead-man target). Staging stack (5 containers) runs 24/7 at 0.01–0.59% CPU (7-day avg) — genuinely idle; the `staging`-label deploy workflow starts it, nothing ever stops it; CI has no runtime dependency on it (visual verification only).
- **Disk creep.** Docker images 22GB with **17.6GB reclaimable (79%)** — per-SHA deploy tags accumulate, never pruned. Build cache 5.5GB (2GB reclaimable). `/var/log` 4.3G. Postgres 13MB (no bloat).

## Decision

Three-phase, strictly ordered (critic-mandated: never bundle calibration with allocation — a rebalance under miscalibrated alerts can mask a real OOM):

**Phase A — alert calibration (~2h, homelab prometheus rules):**

1. Replace `LuckyBotHeapHigh` with container-level truth: `container_memory_working_set_bytes{name="lucky-bot"} / container_spec_memory_limit_bytes{name="lucky-bot"} > 0.9` (what the OOM killer acts on). The nodejs heap metrics stay for dashboards.
2. Switch `HighMemoryUsage` / `CriticalMemoryUsage` from `container_memory_usage_bytes` to `container_memory_working_set_bytes`.
3. Raise `healthchecks` `mem_limit` 512MB → 1G (alerting-critical infra deserves headroom, and it is the one genuinely tight container).
4. **Verification gate:** 24h+ of alert history; success = LuckyBotHeapHigh + HighMemoryUsage firing-minutes drop >90% with no missed real event. Only then Phase C.

**Phase C — allocation + disk (~2-3h, homelab):** 5. Staging on-demand: scheduled stop of the staging stack after N days without a staging deploy (label-deploy already restarts it). Accepted trade-off: a stale staging URL may be down until the next deploy — solo operator, visual-verify-only usage. 6. Docker image prune policy: scheduled prune of images older than ~30 days **retaining anything referenced by running containers and the rollback last-good `:sha`** (deploy.sh rollback depends on prior SHA images existing — a blind `prune -a` would break it). 7. logrotate sanity pass on `/var/log` (4.3G, minor).

**Rejected — Phase B (bot/app efficiency).** No measured need: 24% heap utilization, no growth trend, no CPU pressure. Doing it would be demand-blind optimization.

## Alternatives considered

- **Bot/app efficiency work (cache audits, sweepers, autoplay pipeline).** Rejected: every measurement says healthy; violates measure-first.
- **Allocation first or bundled with calibration.** Rejected per critic: rebalancing limits while the memory alerts are miscalibrated can hide a genuine OOM regression; calibrate, verify, then move limits.
- **No change.** Rejected: 23:1 alert noise carries a real operator-attention cost and degrades the monitoring stack shipped 2026-07-01; 17.6GB of dead images is free disk.
- **Ask the operator to disambiguate intent first.** Attempted twice (grill Q1); operator delegated via /research-and-decide. Interpretation recorded here; trivially re-scopable if wrong.

## Consequences

**Positive:** alert channel becomes trustworthy (protects the new dead-man/email investment); ~0.5Gi memory reclaimed (staging) + headroom where it matters (healthchecks); ~17–19GB disk reclaimed; zero risk taken on a healthy app.

**Negative:** staging has cold-start latency after idle periods; image-prune policy must be maintained alongside deploy.sh's rollback contract.

**Neutral:** bot code untouched; autoplay measurement window (ends ≈2026-07-22) unaffected.

## Revisit when

- **Phase A verification fails** (noise doesn't drop >90% or a real event is missed) → re-diagnose before Phase C.
- **Heap trend turns into sustained growth** (>10MB/week over 30 days) → reopen Phase B with profiling.
- **Staging usage pattern changes** (e.g. e2e tests start targeting it) → revert on-demand stop.
- **Host available memory falls below ~2Gi sustained** → capacity planning, not tuning.
