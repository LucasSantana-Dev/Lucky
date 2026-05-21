---
status: accepted
date: 2026-05-19
revisit_after: after-pilot-executor
---

# Guild Automation reconciles via Module Executors with a Capture / Diff / Apply seam in shared

`packages/backend/src/services/GuildAutomationExecutionService.ts` is a 1238-LOC class that reconciles 7 Manifest modules (Roles, Channels, Onboarding, Moderation, AutoMessages, ReactionRoles, CommandAccess) against live Discord + DB state. A parallel bot-side path lives at `packages/bot/src/utils/guildAutomation/` (`captureGuildState.ts`, `diff.ts`, `applyPlan.ts`) — duplicating much of the same logic with a different Discord write path (`discord.js` Client instead of REST).

We will extract per-module **Module Executors** behind a `Capture / Diff / Apply` seam in `packages/shared/src/services/guildAutomation/`, with a lower `DiscordWriteAdapter` seam so bot and backend both consume the shared executors. Runs remain partial-success-tolerant and reconcile on the next Run via existing `GuildAutomationDrift`.

## Context

- `GuildAutomationExecutionService` mixes Discord REST infra, ID remapping across modules, per-module apply, stale pruning, and Run-record bookkeeping. Deletion test: removing any single module's logic still requires touching this one file.
- Bot has a separate apply path (`packages/bot/src/utils/guildAutomation/applyPlan.ts`, 329 LOC) for the same Manifest. Plan-building logic is duplicated; only the Discord write mechanism differs.
- Drift is already a first-class concept: `GuildAutomationDrift` Prisma model exists, `lastCapturedState` lives on `GuildAutomationManifest`, and `bot/utils/guildAutomation/diff.ts` computes diffs. The capture/diff/apply triplet is implicitly present already — just scattered.
- Tests of any single module (e.g. AutoMessages) currently require mocking infra for all 6 other modules because they all live in one class.

## Decision

Four locked design choices:

1. **Cut line.** Orchestrator owns Discord REST infra (`discordFetch`, `getBotToken`), cross-module ID remapping (`remap*Section`), `GuildAutomationRun` bookkeeping, and parity-checklist defaults. Each **Module Executor** owns Capture, Diff, Apply, and stale-pruning for its module only.
2. **Seam shape.** **Capture / Diff / Apply** triplet. Each Module Executor exposes:
    - `capture(ctx) → LiveState<T>` — reads live Discord/DB state into a typed shape.
    - `diff(live, manifest) → Diff<T>` — computes operations + stale set.
    - `apply(diff, ctx) → ModuleResult<T>` — executes operations, prunes stale, returns result.
3. **Location.** Executors live in `packages/shared/src/services/guildAutomation/`. They depend on a `DiscordWriteAdapter` interface (also in shared). Bot provides `DiscordJsAdapter` (in-process `discord.js` Client). Backend provides `DiscordRestAdapter` (`fetch` + bot token). This collapses the duplicated bot/backend apply paths.
4. **Rollback.** Partial-success + reconcile-on-next-Run. No reverse-op log. If executor N fails, executors 1..N−1 stay live; the next Run's Capture+Diff reconciles. Matches the existing `GuildAutomationRun` schema (`operations`, `protectedOperations`, `error`).

**Enumeration:** seven Module Executors, one per Manifest module section:

| Executor               | Manifest section                                       | Write target                                                     |
| ---------------------- | ------------------------------------------------------ | ---------------------------------------------------------------- |
| Roles Executor         | `roles`                                                | Discord REST/Client (create/edit/delete + ID remap source)       |
| Channels Executor      | `channels`                                             | Discord REST/Client                                              |
| Onboarding Executor    | `onboarding`                                           | Discord REST/Client (mostly read, rare writes)                   |
| Moderation Executor    | `moderation.automod` + `moderation.moderationSettings` | DB (`updateModerationSettings`, `autoModService.updateSettings`) |
| AutoMessages Executor  | `automessages`                                         | DB + Discord channel ID resolution                               |
| ReactionRoles Executor | `reactionroles`                                        | DB (`reactionRolesService`)                                      |
| CommandAccess Executor | `commandaccess`                                        | DB (`guildRoleAccessService`)                                    |

## Considered options

### Cut line

- **A. Orchestrator: infra + remap + run; Executor: apply + prune + drift (accepted).** Clean separation of cross-cutting concerns from per-module concerns.
- **B. Thin orchestrator + fat executors.** Rejected: forces each executor to carry its own Discord REST adapter, duplicating infra across 7 places.
- **C. Fat orchestrator + thin executors.** Rejected: executors become pure-data Module descriptors with logic still centralized — weakest seam, smallest payoff, and `One adapter = hypothetical seam` problem (one impl of each executor type means no real seam).

### Seam shape

- **A. Apply-only.** Rejected: loses native drift integration and pre-apply preview. Closest to current code but smallest refactor benefit.
- **B. Plan + Apply (two-phase).** Considered. Simpler than the triplet but doesn't natively produce a Drift; `GuildAutomationDrift` would remain a separate code path.
- **C. Capture / Diff / Apply triplet (accepted).** Aligns with existing `GuildAutomationDrift` model, `lastCapturedState` field, and the bot-side `captureGuildState.ts`/`diff.ts`/`applyPlan.ts` split. Drift detection becomes a side-product of normal flow.
- **D. Hybrid (apply-only for onboarding, plan+apply for others).** Rejected: two interface kinds for one seam adds learning cost without clear win.

### Location

- **A. `shared/src/services/guildAutomation/` + `DiscordWriteAdapter` (accepted).** Both packages consume the same executors. Solves the bot↔backend duplication that would otherwise need a separate follow-up ADR.
- **B. `backend/src/services/guildAutomation/` only.** Rejected: leaves the bot-side `applyPlan.ts` duplication in place. Future-us would re-litigate this immediately.
- **C. Promote `bot/src/utils/guildAutomation/`.** Rejected outright. Violates the architecture invariant in `docs/ARCHITECTURE.md`: backend depends only on shared, not on bot.

### Rollback

- **A. Partial-success + reconcile (accepted).** Matches the existing `GuildAutomationRun.operations` / `protectedOperations` / `error` schema. Drift becomes visible via `GuildAutomationDrift` and the next Run converges.
- **B. All-or-nothing rollback.** Rejected: doubles per-executor surface (each must emit reverse-ops), and Discord API doesn't cleanly reverse some operations (permission edits, onboarding mutations).
- **C. Idempotent retry only.** Rejected: no rollback path means broken intermediate state is user-visible in the Guild between Runs.
- **D. Hybrid best-effort revert per failing executor.** Rejected for the initial design — adds complexity without justification; revisit if partial-success data shows users frequently stuck on a half-applied state.

## Consequences

**Positive:**

- Each Module Executor is unit-testable by mocking only the `DiscordWriteAdapter`. No real Discord client needed in tests.
- Bot↔backend duplication collapses; `bot/src/utils/guildAutomation/applyPlan.ts` becomes a thin caller of the shared executors via `DiscordJsAdapter`.
- New module types (e.g. a future "Voice Channels" or "Slowmode Policy" module) add one Executor file, not edits in two packages.
- Drift detection is automatic: Capture + Diff produces a Drift result that the orchestrator can persist to `GuildAutomationDrift` without separate code.
- Locality: each module's logic lives in one file under `shared/src/services/guildAutomation/<module>Executor.ts`.

**Negative:**

- Migration cost is real: 1238 LOC backend class + 329 LOC bot apply + scattered diff/capture/remap utilities all rewire. Expect ≥4 PRs to land safely.
- `DiscordWriteAdapter` interface must be designed carefully — wrong methods leak Discord internals to executors anyway.
- Cross-cutting infra (auth tokens, retry policies) must stay outside executors and inside the adapters/orchestrator; risk of accidentally re-introducing the monolith inside one Executor.

**Neutral:**

- `GuildAutomationRun` schema unchanged. `GuildAutomationDrift` schema unchanged. `GuildAutomationManifest.lastCapturedState` semantics unchanged.

## Implementation plan (pilot-first)

1. **Pilot Executor.** Pick the simplest write path — likely **AutoMessages Executor** (DB-only, no Discord REST) — and implement it in `shared/src/services/guildAutomation/autoMessagesExecutor.ts`. Define `ModuleExecutor<T>` and `DiscordWriteAdapter` interfaces. Backend orchestrator calls this Executor; old code path stays for the other 6 modules.
2. **Bot consumer.** Wire bot to call the AutoMessages Executor through `DiscordJsAdapter`. Delete the duplicated automessages logic in `bot/src/utils/guildAutomation/applyPlan.ts`. This is the first cross-package consumption — proves the location works.
3. **Migrate remaining 6 Executors** one PR per Executor, easiest first: Moderation (DB-only) → ReactionRoles → CommandAccess → Onboarding (mostly read) → Channels → Roles (most complex; ID remap-heavy).
4. **Decommission the monolith.** Once all 7 executors are migrated, delete `GuildAutomationExecutionService` and the duplicated bot apply path. Verify the guardrail test in `bot/utils/guildAutomation/` is updated to enforce "no Manifest reconciliation outside `shared/services/guildAutomation/`".

## Revisit when

- **After the pilot Executor PR lands** — re-open this ADR with concrete evidence on whether the seam shape held up. Adjust before migrating the other 6.
- The pilot reveals that `DiscordWriteAdapter` needs to leak so much Discord state that executors end up adapter-coupled anyway.
- A new Manifest module type would naturally fit a different shape (e.g. requires multi-phase commit, transactions across DB + Discord).
- Production data on `GuildAutomationDrift` shows partial-success Runs cause user-visible degradation that argues for option D (best-effort revert).
- Lucky adopts a different Discord library (currently `discord.js` v14) — would force a `DiscordWriteAdapter` redesign and is a natural moment to reconsider.

## Cross-references

- `CONTEXT.md` — see entries: **Guild Automation**, **Manifest**, **Drift**, **Run**, **Module Executor**, **Discord Write Adapter**, **Capture / Diff / Apply**.
- `docs/ARCHITECTURE.md` — confirms the `backend → shared` dependency direction and `bot → shared` direction that make this design legal.
- `docs/decisions/2026-05-19-automod-does-not-create-moderation-cases.md` — confirms the Moderation Executor covers `automod` + `moderationSettings` sub-sections without bridging to `ModerationCase`.
- This ADR was produced via `/improve-codebase-architecture` grilling on Lucky's `packages/` graph (2026-05-19 session) — the candidate ranked #2 (worst friction) of seven deepening opportunities surfaced.
