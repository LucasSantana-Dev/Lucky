# ADR: Split GuildAutomationService into Orchestrator and Repository

**Date:** 2026-05-23  
**Status:** Accepted

## Context

`packages/shared/src/services/guildAutomation/service.ts` (534 LOC) is the entry point for the Guild Automation subsystem. It currently mixes:

- **Orchestration logic:** invoke Module Executors, aggregate Run results, handle partial-success
- **Prisma data access:** upsert `GuildAutomationRun`, `GuildAutomationDrift`, `GuildAutomationManifest`
- **Lock management:** optimistic locking around concurrent Run invocations
- **Drift persistence:** writing Drift records after each Module Executor completes

This conflation has two consequences:

1. **Untestable orchestration.** Testing the Run lifecycle (what happens when one Module Executor fails? how is the partial-success result constructed?) requires mocking the entire Prisma layer and the locking mechanism. There is no seam between "Run the executors" and "Persist the outcome."

2. **Premature lock for incomplete work.** Only 2 of 7 Module Executors are implemented (`autoMessagesExecutor`, `moderationExecutor`). Both are shallow pass-throughs. Until the remaining 5 executors (Roles, Channels, Onboarding, ReactionRoles, CommandAccess) exist, the orchestration logic can't be meaningfully tested — the complexity that should live in executors still lives in the service, making the orchestration/persistence conflation invisible.

This ADR codifies the split that the existing `GuildAutomationExecutionService` refactor plan intended (referenced in `docs/decisions/2026-05-19-guild-automation-module-executors.md`) but which was not structurally separated.

## Decision

Split `service.ts` into two modules:

**`GuildAutomationOrchestrator`** (pure logic, no Prisma import):

- Accepts `(manifest, liveState, executors[], ctx)`
- Calls each Module Executor's Capture/Diff/Apply phases
- Aggregates per-executor `ExecutorApplyResult` into a Run-level `RunResult`
- Returns `RunResult` — does not write to the database
- Depends only on executor interfaces and the `GuildAutomationRepository` interface

**`GuildAutomationRepository`** (Prisma + lock management):

- Owns `GuildAutomationRun`, `GuildAutomationDrift`, `GuildAutomationManifest` reads/writes
- Owns the optimistic lock protocol
- Implements the `IGuildAutomationRepository` interface the orchestrator depends on

The existing `service.ts` becomes a thin coordinator that:

1. Calls `repository.acquireLock(guildId)`
2. Calls `repository.getManifest(guildId)` → `repository.getLiveState(guildId)`
3. Calls `orchestrator.run(manifest, liveState, executors)`
4. Calls `repository.persistRunResult(runResult)` + `repository.releaseLock(guildId)`

## Alternatives Considered

**Keep as-is until all 7 executors are built.** Deferred and not rejected: a valid sequencing argument. The split is small enough (~150 LOC refactor) that doing it now avoids building the remaining 5 executors on top of the mixed-concern service.

**Extract just the Prisma layer to a separate file.** Rejected: that's half the split. If we're separating concerns, the full Orchestrator/Repository boundary is cleaner and more testable than a partial extraction.

**Use a transaction script pattern (no orchestrator).** Rejected: transaction scripts co-locate persistence and logic, which is the problem we're solving.

## Consequences

**Positive:**

- `GuildAutomationOrchestrator` is unit-testable with stub executors and a stub repository — no Prisma in scope.
- Lock protocol changes (e.g., moving from optimistic to advisory) land in `GuildAutomationRepository` only.
- Each of the remaining 5 Module Executors can be built and tested against the orchestrator interface without touching the Prisma layer.

**Negative:**

- One more interface (`IGuildAutomationRepository`) to maintain.
- The thin coordinator (`service.ts`) is almost trivially simple — may feel like unnecessary indirection until the full executor suite exists.

## Revisit When

- All 7 Module Executors are implemented and the test suite covers the full Run lifecycle — at that point, reconsider whether the thin coordinator can be collapsed back into the repository.
- The lock protocol needs to change (e.g., distributed lock across multiple bot instances).
