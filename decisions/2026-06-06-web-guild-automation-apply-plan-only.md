# ADR 2026-06-06 — Web Guild Automation "apply" is plan-only until the executor migration lands

**Status:** Accepted
**Via:** `/research-and-decide` (critic adjudicated A vs B; landed on B + a data-integrity fix — no flip)
**Relates to:** [2026-05-19-guild-automation-module-executors](2026-05-19-guild-automation-module-executors.md) · PRD #1059 (complete the executors) · [2026-06-06-decommission-backend-guild-automation-execution-service](2026-06-06-decommission-backend-guild-automation-execution-service.md)

## Context

Confirmed P1, found while investigating the decommission ADR's "possible functional gap":

The web dashboard's Guild Automation page has **Apply** + **Reconcile** buttons. `Apply`
calls `POST /automation/apply` → `GuildAutomationOrchestrator.createApplyRun()`, which:
computes a plan, writes a `GuildAutomationRun` with **`status: 'completed'`** and a populated
**`autoAppliedOperations`** list, and returns — **without invoking any executor or mutating
the Discord guild / settings tables** (verified: zero `.apply()` calls anywhere in
`shared/services/guildAutomation/`; the repository does only Prisma bookkeeping). The web UI
then toasts **"Changes applied."**

So the web Apply is a **no-op that reports success**, and the run record is a **false audit
trail**. The only code that actually mutates a guild is the bot's `/guildconfig apply` slash
command (`bot/utils/guildAutomation/applyPlan.ts`, direct discord.js writes + 3 shared
executors); there is **no bridge** from a backend run to bot application.

Root cause: the Module Executor migration replaced the backend's executing
`GuildAutomationExecutionService` with a **plan-only** orchestrator and relocated execution to
the bot, but the **web UI was never updated**. The intended end-state (ADR 2026-05-19) _does_
have the backend applying via a `DiscordWriteAdapter` → `DiscordRestAdapter` seam — but that
seam **does not exist yet** (never built), and 4 of 7 executors (Roles, Channels, Onboarding,
CommandAccess — the Discord-writing ones that need the adapter) are unbuilt. ADR estimate to
finish: "≥4 PRs" (PRD #1059).

## Decision

**B — make the web UX honest now; defer real web apply (A) to the executor migration.**

Immediate fix (one small PR):

1. **Frontend:** relabel the web **Apply** action away from claiming application (e.g. "Record
   plan" / present it as a dry-run + parity record); replace the `"Changes applied."` toast with
   one that states a plan was recorded and that applying happens via `/guildconfig apply` in
   Discord. Same for **Reconcile**.
2. **Backend/shared (data-integrity, do regardless of A/B):** stop recording a **false
   completion** — `createApplyRun` must not mark the run `completed` with `autoAppliedOperations`
   populated when nothing executed. Record it as **plan-only / not-applied** (a planned/queued
   status or an explicit `applied: false`, per the run model) with `autoAppliedOperations: []`.
3. Verify the bot `/guildconfig apply` path and `getStatus`/`listRuns` displays are unaffected.

Real backend-driven web apply (**Option A**) is the _correct end-state_ and is **deferred to
PRD #1059**: it requires building the `DiscordWriteAdapter` + backend `DiscordRestAdapter` and
wiring `createApplyRun` to invoke executors. When that lands, re-enable the web Apply label/toast.

## Alternatives considered

- **A — make web apply real now.** Rejected as the _immediate_ fix: it means finishing a
  multi-PR migration (the adapter seam + 4 executors, "≥4 PRs") just to correct a misleading
  toast, for a niche feature with ~near-zero web usage. It is the right _destination_ (kept as
  the deferred end-state), not a P1 hotfix. Violates the no-big-bang-mid-hotfix instinct.
- **Hybrid — wire only the 3 built DB-only executors into backend apply now.** Rejected, worse
  than the status quo: web apply would mutate 3 of 7 modules and silently skip Roles/Channels/
  Onboarding/CommandAccess, splitting the lie across modules and making "what actually changed?"
  harder to reason about.

## Consequences

- **Positive:** kills the misleading "Changes applied" success and the false `autoAppliedOperations`
  audit trail in hours, not weeks; keeps PRD #1059 independent; matches current reality (bot is
  the working apply path); fully reversible when A lands.
- **Negative:** the web's headline "apply" capability is openly downgraded to plan/record until
  the migration completes — users must apply via the Discord `/guildconfig` command.
- **Neutral:** a back-fill of any pre-existing falsely-`completed` web runs is _optional_ — given
  near-zero usage it's likely unnecessary; decide when implementing.

## Revisit when

- **PRD #1059 reaches the adapter-seam stage** → implement Option A: build
  `DiscordWriteAdapter`/`DiscordRestAdapter`, wire `createApplyRun` to invoke executors, restore
  the web Apply label/toast. (This ADR's stopgap ends here.)
- **Web-apply usage proves non-trivial** (e.g. >5% of guilds attempt it) → escalate A's priority
  ahead of the rest of #1059.
- **The `DiscordWriteAdapter` design reveals insurmountable Discord-state coupling** → re-litigate
  whether the backend should apply at all (vs web → bot-bridge), per ADR 2026-05-19's own
  no-go condition.
