# ADR 2026-08-03 — Guild Automation: remove the subsystem (D), phased web/backend → bot → schema

**Status:** Accepted
**Deciders:** Lucas Santana
**Closes the loop on:** `decisions/2026-06-06-guild-automation-migration-freeze-and-instrument.md` (sunset gate 3: neither gate fired by 2026-07-06 → run C-vs-D) · PRD #1059

## Telemetry (the fact the freeze was waiting for)

Measured 2026-08-03 against prod, ~8 weeks after instrumentation shipped:

- **Web/backend path:** `guild_automation_runs` table — **2 runs ever, latest 2026-05-01**; 0 runs and 0 manifest touches in the last 60 days. The Prometheus counter (`lucky_guild_automation_usage_total`) has **no series at all** — zero plan/apply/reconcile attempts since instrumentation deployed (labeled counters only appear after the first increment).
- **Bot path (`/guildconfig apply`):** same counter, bot side — **no series**; zero uses since instrumentation.
- **Active guilds:** 29. Usage gate (>5% of active guilds in any 7-day window) is not close: it is zero.

This satisfies the 2026-06-06 ADR's own criterion for D ("telemetry shows ~zero usage of *both* paths"). The earlier objection to D — "removing a working, shipped feature is user-hostile" — assumed unknown usage; usage is now known-zero.

## Decision

**Remove the Guild Automation subsystem entirely (D), in three phases:**

1. **Phase 1 — web + backend:** delete the frontend automation page + API client, the backend routes (`guildAutomation.ts`), orchestrator/repository usage, and the usage counter. Sidebar entry goes with it.
2. **Phase 2 — bot + shared core:** delete `/guildconfig apply`, then the shared machinery (manifest/diff/3 executors/orchestrator/repository, ~2,100 LOC).
3. **Phase 3 — schema:** drop `guild_automation_manifests`, `guild_automation_runs`, `guild_automation_drifts` in a standalone migration PR, after 1–2 have deployed clean.

Not in this decision: the `CandidateAggregator` seam that was deferred until GA decommission (`decisions/2026-05-24-candidate-aggregator-deferred.md`) — that revisit is now unblocked and tracked in the roadmap.

## Alternatives considered

- **C — descope (keep bot path, rip out web/backend).** Rejected: the bot path is *also* zero-usage; keeping 548 LOC of bot command plus ~2,100 LOC of shared core for zero users keeps the maintenance sink alive in smaller form.
- **A — complete the migration.** Rejected: the usage gate that would have triggered it reads zero; ≥4 PRs + a never-reviewed adapter for a feature nobody runs.
- **Keep frozen longer.** Rejected: freeze was explicitly time-boxed to prevent decay into permanent; the data is unambiguous.

## Consequences

**Positive:** ~4,900 hand-written LOC (~5.5% of the repo) of frozen machinery leaves the tree; no more parity/cutover entanglement; PRD #1059 closes as "removed for zero usage" rather than "deferred" forever; decommissioning unblocks the `CandidateAggregator` revisit.
**Negative:** if a guild ever asks for template-apply, the answer is manual setup or a fresh, much smaller design — the code stays in git history.
**Neutral:** the 2 historical runs and 2 manifests are disposable data; no user-visible behavior changes (web apply was already plan-only).

## Revisit when

- Never for restoration — a future need gets a new, smaller design informed by this one's failure mode (built ahead of demand).
