---
status: accepted
date: 2026-05-20
revisit_after: after-PR-4-onboarding-executor
---

# Guild Automation Module Executors are built at orchestrator composition roots, not as shared singletons

The AutoMessages Module Executor pilot (PRs #901 and #906, ADR `2026-05-19-guild-automation-module-executors.md`) shipped with a module-level singleton in `packages/shared/src/services/guildAutomation/index.ts`:

```ts
import { autoMessageService } from '../AutoMessageService.js'
import { createAutoMessagesExecutor } from './autoMessagesExecutor'
export const autoMessagesExecutor = createAutoMessagesExecutor({
    autoMessageService,
})
```

Both `GuildAutomationExecutionService` (backend) and `applyPlan.ts` (bot) import the singleton and call `.capture / .diff / .apply` on it. This ADR retires that singleton and standardises on **factory-built executors composed at each orchestrator's composition root** before the next executor PR (Moderation) lands.

## Context

- The 7-executor extraction plan (ADR `2026-05-19-guild-automation-module-executors.md`) sequences DB-only executors first (Moderation, ReactionRoles, CommandAccess) and Discord-writing ones later (Onboarding, Channels, Roles).
- 3 of the remaining 6 executors **cannot** be singletons: Onboarding, Channels, and Roles need a `DiscordWriteAdapter` whose concrete impl differs between bot (in-process `discord.js` Client) and backend (Discord REST + bot token). A module-level singleton in `packages/shared` can't carry a package-specific adapter.
- 3 of the remaining 6 _could_ be singletons (DB-only, identical bot/backend). Keeping the singleton pattern for just those creates a divided shape: half the executors imported from a shared singleton, half constructed per-orchestrator.
- Both orchestrator specs (`packages/bot/src/utils/guildAutomation/applyPlan.spec.ts`, `packages/backend/tests/unit/services/GuildAutomationExecutionService.test.ts`) already build executors per-test via `createAutoMessagesExecutor()` with mocked deps. They never relied on the singleton. Composition-root construction is therefore a zero-test-rewrite migration.
- Backend orchestrator (`GuildAutomationExecutionService.ts`) is a class with no constructor params today; bot orchestrator (`applyPlan.ts`) is a free function with module-scope imports. Both have a natural place to bind an executor instance (class field or module-scope const) without restructuring.

## Decision

1. **Delete the `autoMessagesExecutor` singleton export from `packages/shared/src/services/guildAutomation/index.ts`.** Shared exports only `createAutoMessagesExecutor` plus the executor's types.
2. **Each orchestrator constructs the executor it needs at its composition root.** Backend: module-scope const inside `GuildAutomationExecutionService.ts` (or a class field if the class gains a constructor later). Bot: module-scope const in `applyPlan.ts` next to existing top-level imports.
3. **No DI container, no executor registry, no abstract factory.** Direct `createAutoMessagesExecutor({ autoMessageService })` calls at each composition root. The shared-side `createXExecutor` builders stay as the only seam.
4. **Land this before the next executor PR (Moderation).** Establishes the precedent so PRs #2–#7 of the executor sequence inherit it unchanged. Onboarding (PR #4) introduces `DiscordWriteAdapter` at the same composition root without a pattern flip.

## Considered options

- **A. Drop singleton, compose at orchestrator roots for all 7 (accepted).** Single consistent pattern. Zero test restructuring per current spec evidence. Onboarding/Channels/Roles slot in naturally via the same composition seam (just with a `DiscordWriteAdapter` argument).
- **B. Singleton for DB-only executors, composition-root for Discord-writing.** Rejected. Creates a bifurcated shape: 4 singleton exports in `shared/index.ts` (AutoMessages + the 3 DB-only) alongside 3 factory-only exports for the Discord-writing ones. When PR #4 (Onboarding) lands, the choice is either accept the inconsistency forever or do a coordinated mid-stream refactor across both orchestrators — exactly the cost option A is trying to avoid.
- **C. Keep the singleton; add `withAdapter(executor, adapter)` later for Discord-writing.** Rejected outright. The adapter is needed at _construction_ (the executor closes over it for use inside `apply`), not as a per-call argument. Wrapping a singleton after the fact would force the apply surface to take an adapter parameter, leaking adapter state into the executor's public API.
- **D. Build a shared executor registry in `packages/shared` keyed by module name, plus a DI helper to construct it per package.** Rejected. Over-engineered for 7 modules. Adds a registry abstraction and a DI surface that nothing else in Lucky uses; the critic explicitly flagged this would replicate the monolith inside one abstraction.

## Consequences

**Positive**

- One executor composition pattern across all 7 modules. No mental tax for the next contributor reading PR #4.
- `packages/shared/src/services/guildAutomation/index.ts` stops importing `AutoMessageService` (singleton-side import goes away), removing a small layering smell inside the shared barrel.
- Orchestrator specs simplify: backend's current `jest.requireActual('@lucky/shared/services/guildAutomation/autoMessagesExecutor')` dance inside the mock factory becomes a direct mock of the orchestrator-local executor instance.
- Composition-root is where future cross-cutting decorators (metrics, tracing, retry policies) attach without monkey-patching imports.

**Negative**

- ~10 LOC of wiring per orchestrator (one module-scope const + one removed singleton import). Not free.
- Re-imports of `autoMessageService` move from `shared/index.ts` to both orchestrators. Trivial, but it's a churn line in the PR diff.

**Neutral**

- `GuildAutomationRun` and `GuildAutomationDrift` schemas unchanged. ADR `2026-05-19-guild-automation-module-executors.md` is not invalidated — this ADR is a refinement of its "Pilot Executor" step 1.

## Revisit when

- **PR #4 (Onboarding Executor) lands**, surfacing the first `DiscordWriteAdapter` consumer. Confirm the composition-root pattern carries the adapter cleanly. If not, this ADR is the place to record the change.
- A future Lucky package (e.g. a new service or worker) needs to apply Manifest changes and we discover the cost of re-wiring executors at _that_ package's composition root is high enough to argue for a shared registry. Concrete signal: ≥3 packages duplicating the executor-construction block.
- We adopt a DI container across Lucky for unrelated reasons; at that point the executor composition would naturally fold into it.
- Production data shows orchestrator boot-time cost from per-orchestrator executor construction is non-trivial (extremely unlikely — these are pure object literals).

## Cross-references

- `decisions/2026-05-19-guild-automation-module-executors.md` — parent ADR.
- `packages/shared/src/services/guildAutomation/autoMessagesExecutor.ts` — first executor; its `createAutoMessagesExecutor` builder is the seam this ADR commits to.
- `packages/bot/src/utils/guildAutomation/applyPlan.spec.ts`, `packages/backend/tests/unit/services/GuildAutomationExecutionService.test.ts` — orchestrator specs that already build executors per-test, evidence cited for zero-test-rewrite migration.
- `~/.claude/projects/-Volumes-External-HD-Desenvolvimento-Lucky/memory/feedback_wait_for_quality_gates_2026-05-19.md` — Quality Gates lane is the authority for green-on-merge.
- This ADR was produced via `/research-and-decide` during a `/grill-me` session on PR #906 (commit `a2b0c8a7`).
