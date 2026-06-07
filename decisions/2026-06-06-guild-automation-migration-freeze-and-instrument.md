# ADR 2026-06-06 — Freeze the Guild Automation executor migration; instrument usage before completing or descoping

**Status:** Accepted
**Via:** `/research-and-decide` (critic adjudicated complete vs freeze vs descope vs remove; landed on freeze-as-holding-state + measure — no flip)
**Relates to / umbrella for:** PRD #1059 · [2026-05-19-guild-automation-module-executors](2026-05-19-guild-automation-module-executors.md) · [2026-06-06-decommission-backend-guild-automation-execution-service](2026-06-06-decommission-backend-guild-automation-execution-service.md) · [2026-06-06-web-guild-automation-apply-plan-only](2026-06-06-web-guild-automation-apply-plan-only.md)

## Context

Two prior decisions this session (decommission the dead 1,333-LOC backend service; make web
"apply" honest/plan-only) exposed a bigger question: **is the Guild Automation Module Executor
migration (PRD #1059) worth completing at all?**

Verified state:

- **Footprint ≈ 4,900 hand-written LOC** (≈5.5% of the repo): shared core 2,084
  (manifest/diff/3-of-7 executors/orchestrator/repository); backend 1,531 (incl. the 1,333-LOC
  monolith already decided for deletion + a 198-LOC route); bot apply 548; frontend page+api 726.
- **Migration stalled at 3 of 7 executors**, all DB-only. The `DiscordWriteAdapter` /
  `DiscordRestAdapter` seam — the linchpin that lets the _backend_ apply Discord-writing modules
  and that collapses the bot/backend duplication — was **never built**. The 4 remaining modules
  (Roles, Channels, Onboarding, CommandAccess) are mostly Discord-writing and need it. ADR estimate
  to finish: "≥4 PRs"; the adapter design carries flagged coupling risk and has had **no design review**.
- A **working apply path exists**: the bot `/guildconfig apply` command. Only the web/backend path
  is hollow (now being made plan-only).
- The subsystem has been a recurring **maintenance sink** (a 1,333-LOC dead service; a P1
  misleading-apply bug; a stalled migration).
- **Usage is UNMEASURED.** No telemetry on automation apply/plan. The web page is prominent in the
  sidebar (discoverable) but we do not know how many guilds use it. "Near-zero usage" is an
  **assumption**, and the choice between completing (A) and descoping/removing (C/D) hinges on it.

## Decision

**Freeze the migration as the holding state, fix the accumulated debt, and instrument usage. Defer
the A-vs-C/D choice to explicit data/design gates — do not make a large irreversible bet blind.**

Holding-state actions (small, mostly already decided):

1. Implement [2026-06-06-decommission-backend-guild-automation-execution-service] — delete the dead
   1,333-LOC monolith + its test.
2. Implement [2026-06-06-web-guild-automation-apply-plan-only] — honest web UX + plan-only run record
   (kills the false "completed"/autoApplied audit trail).
3. **NEW — instrument usage:** add lightweight per-guild counters on the web `/automation/plan` and
   `/automation/apply` attempts and the bot `/guildconfig apply` subcommand (count + guildId, no PII).
   This is the missing fact that should drive A-vs-C/D. Cheap (≈ middleware + one log/metric).
4. Reflect the freeze on PRD #1059 (status: frozen pending the gates below); do not open further
   executor PRs until a gate fires.

This explicitly does **not** complete the migration (A) now, nor descope/remove (C/D) now.

## Alternatives considered

- **A — Complete the migration now.** Rejected as the immediate move: ≥4 PRs of speculative effort
  (incl. designing the never-built adapter, with flagged coupling risk and no design review) for a
  feature of **unknown demand**, in a solo-maintainer context. Kept as the destination if a gate fires.
- **C — Descope/simplify (rip out web+backend orchestration + parity/cutover, keep bot path).**
  Rejected _now_: parity/cutover is entangled (non-trivial surgery), and removing a shipped,
  discoverable web feature on an **assumed**-low usage could destroy real value. Becomes the likely
  path if telemetry shows the web path is unused.
- **D — Remove the whole feature (bot + web).** Rejected: the bot `/guildconfig apply` is a working,
  shipped feature; removing it blind is user-hostile. Only reconsider if telemetry shows ~zero usage
  of _both_ paths.

## Consequences

- **Positive:** stops the bleeding cheaply (delete dead code, honest UX, telemetry) without betting
  4+ PRs on unknown demand; converts a speculative A-vs-C/D argument into a data-driven one; keeps the
  working bot path intact.
- **Negative:** the subsystem stays half-built — web apply is plan-only and ~3,500 LOC of frozen
  machinery is carried until a gate fires. "Freeze" can decay into "permanent" (the explicit gates +
  the 2026-07-06 sunset trigger below exist to prevent that).
- **Neutral:** completing the migration remains fully possible; nothing here forecloses A.

## Revisit when (the gates that resolve the deferred A-vs-C/D)

1. **Usage telemetry shows >5% of active guilds use the web apply/plan path in any 7-day window** →
   escalate **A**: do the `DiscordWriteAdapter` design review, then build the seam + 4 executors + wire
   backend/web apply.
2. **A `DiscordWriteAdapter` design review (pre-mortem + adapter test plan) is completed and passes** →
   confidence is high enough to proceed with **A** without waiting on usage data.
3. **Neither gate fires by 2026-07-06 (30 days)** → close PRD #1059 as deferred and run a focused
   **C-vs-D** decision (descope vs remove) using the telemetry collected by then.
