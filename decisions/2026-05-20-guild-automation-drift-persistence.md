---
status: accepted
date: 2026-05-20
revisit_after: after-PR-6-channels-executor-or-6-months
---

# Guild Automation drift records are updated by the apply path, not just by `/plan`

Today `GuildAutomationDrift` rows are only written via `createPlan()` (`packages/shared/src/services/guildAutomation/service.ts:217-243`). The executor pilot (PR #906, commit `a2b0c8a7`) computes a fresh `capture` + `diff` on every apply Run and throws the result away. The dashboard's drift view at `/api/guilds/:guildId/automation/status` stays stale until the user re-runs `/plan`. This ADR commits the backend orchestrator to update drift records from `ExecutorApplyResult` after each module's apply, with a unified canonical JSON shape across all drift writers.

## Context

- Parent ADR `decisions/2026-05-19-guild-automation-module-executors.md` claimed "Drift detection is automatic: Capture + Diff produces a Drift result that the orchestrator can persist." That promise is unmet at PR #906.
- Sibling ADR `decisions/2026-05-20-guild-automation-executor-partial-failure.md` introduces `ExecutorApplyResult<T> = { status: 'success' | 'partial' | 'failed' }`. The reader of that union is the natural place to update drift, because it already knows per-module success / partial / failure.
- `GuildAutomationDrift` schema (`prisma/schema.prisma:230-242`): unique on `(guildId, module)`, holds `drift: Json`, `severity: String`. Per-guild bounded by module count (~7 max). No deletes anywhere in the codebase today — records only refresh via upsert from `/plan`.
- Frontend (`packages/frontend/src/services/automationApi.ts`) reads only `{ module, severity, updatedAt }` from each drift record via `/automation/status`. No per-op UI exists today, but the JSON shape will become user-visible if such UI is added (the critic flagged this as the real lock-in risk).
- Existing `/plan` writer produces `GuildAutomationDiffOperation[]` JSON (generic plan ops). A new executor-path writer would naturally produce executor-specific shapes (e.g. `AutoMessagesDiff.ops`). Two writers with two shapes is a hidden contract violation.

## Decision

1. **Backend orchestrator (and only the backend) updates `GuildAutomationDrift` after each module's apply,** reading the `ExecutorApplyResult` returned by the executor:
    - `'success'` → upsert that module's row to `{ drift: [], severity: 'none' }`. Effectively clears the drift indicator.
    - `'partial'` → upsert to `{ drift: <residual ops as ExecutorDriftOp[]>, severity: <recomputed from error count> }`. Residual = the ops that failed (from `ExecutorApplyResult.errors`).
    - `'failed'` → leave the row untouched. Whatever `/plan` last wrote remains the best estimate of what's pending; reapplying later will reconcile.

2. **Unify drift JSON to a single canonical shape.** Introduce `ExecutorDriftOp` in `packages/shared/src/services/guildAutomation/executorTypes.ts` (the file added by the apply-shape sibling ADR):

    ```ts
    export type ExecutorDriftOp = {
        module: AutomationModule
        action: 'create' | 'update' | 'delete' | 'noop'
        target: string // e.g. 'welcome' for AutoMessages, role ID for Roles
        reason?: string // populated on partial-failure entries
    }
    ```

    Refactor `service.ts:createPlan()` to write this shape too. Old rows are not migrated — drift is ephemeral (no consumer reads historical drift), and the next `/plan` or apply on each `(guildId, module)` overwrites the row in place.

3. **Bot does NOT write drift.** `packages/bot/src/utils/guildAutomation/applyPlan.ts` reads `ExecutorApplyResult`, emits structured `errorLog` on `'partial'` / `'failed'`, but never touches Prisma's `guildAutomationDrift`. Drift persistence is a backend orchestrator concern; the bot would need to import Prisma (it doesn't today, by the bot ↔ shared boundary in `docs/ARCHITECTURE.md`) to do this.

4. **Concurrent upserts on `(guildId, module)` are explicitly accepted as last-write-wins.** Document this inline at the upsert site. The blast radius is transient: a stale severity resolves on the next `/plan` or apply. Do not add a version column or DB trigger unless production data shows the race is operator-visible — see revisit triggers.

5. **`lastCapturedState` on `GuildAutomationManifest` is NOT touched by apply.** It remains the user-supplied baseline as today. Apply writes drift; capture-on-demand writes `lastCapturedState`. The two are independent (the critic confirmed this is non-overlapping).

6. **Severity computation is a placeholder.** Use `errors.length > 5 → 'high'`, `> 2 → 'medium'`, `> 0 → 'low'`, otherwise `'none'`. The parent ADR explicitly deferred severity heuristics to a post-pilot PR; this placeholder is consistent with the existing `service.ts:createPlan()` severity logic (which uses op counts similarly). Replace when cross-module severity policy lands.

## Considered options

- **A. Status quo (apply doesn't touch drift).** Rejected. After a clean apply the dashboard still shows "drifted" until the user manually re-runs `/plan`. Surprising UX. Cost of fix is small (~50 LOC); cost of doing nothing is recurring operator confusion every time someone applies.
- **B. Apply path updates drift records per-module (accepted).** See decision above.
- **C. Apply path re-captures after applying, computes residual diff, persists.** Rejected. Doubles capture cost per Run (one before apply, one after). For DB-only modules the cost is negligible; for Discord-touching modules it's two REST round trips per Run. The marginal accuracy gain (residual diff exactly mirrors post-apply state) is captured by option B with one fewer capture — the executor's `errors[]` already tells us what failed, so we don't need a second capture to compute residual state.
- **D. Persist pre-apply intent diff, let `/plan` reconcile later.** Rejected. Conflates "what we tried to do" with "what's still wrong." Operator reading the dashboard right after an apply would see the pre-apply intent, not the post-apply residual — exactly the bug option A has.
- **E. Use a CQRS / event-sourcing model where drift is a projection of apply events.** Rejected for now. Lucky has no event store today. Massive over-engineering for a ~7-module schema with bounded row count per guild. Revisitable if Lucky adopts event sourcing for other reasons.

## Consequences

**Positive**

- Dashboard reflects post-apply state immediately after `/apply` without requiring a separate `/plan` call.
- The orchestrator's reader of `ExecutorApplyResult` is the single source of truth for both `GuildAutomationRun.operations` (per-run history) and `GuildAutomationDrift` (per-module current state). One reader, two persistence targets.
- Drift JSON shape is unified across `/plan` and apply writers — future per-op UI consumers read one shape, not two.
- Drift records self-clean on successful apply (severity → 'none', drift → []). Previously rows accumulated severity stale.

**Negative**

- One extra Prisma upsert per applied module per Run. At Lucky's current ~3000-guild scale and 7 modules max, that's ≤21 upserts per full reconcile Run. Negligible.
- Concurrent apply + scheduled-reconcile on the same `(guildId, module)` is last-write-wins. Documented and accepted as transient.
- Drift JSON shape refactor in `service.ts:createPlan()` is a write-side change to an existing production path. Old rows remain readable by the frontend (which only inspects `severity`/`updatedAt`), so user-visible impact is zero — but it does mean rows written before this PR have a different `drift` JSON shape than rows written after. Acceptable because drift is ephemeral (next plan/apply overwrites).

**Neutral**

- Schema unchanged. No migration. `lastCapturedState` semantics unchanged.
- Frontend code unchanged — it consumes `severity` + `updatedAt`, both still populated.

## Revisit when

- **At PR #6 (Channels Executor).** Channels has the highest realistic op count (5-30 per Run); confirm that on a partial Channels apply the residual drift accurately lists the failed ops and the dashboard severity updates as expected.
- **Drift writes exceed 5% of apply latency** at full scale (instrumentable via Sentry / OpenTelemetry span on the upsert call). Mitigation: add a summary `severity` column updated cheaply without rewriting the full `drift` JSON, or batch-upsert via a single Prisma transaction at the end of the Run.
- **Operators report dashboard stale after apply** despite this change → diagnose: is the reader actually upserting? Is frontend cache stale? Add a manual cache-bust on `/apply` response.
- **Operators report "drift shows wrong ops after partial apply"** → revisit the residual-mapping logic (`errors → ExecutorDriftOp[]`) for that specific executor.
- **Second drift writer appears** (e.g. external sync tool, webhook-driven invalidator) → revisit concurrent-upsert tolerance; may justify a `version` column or move to event sourcing (option E).
- **A consumer adds per-op UI** to the drift dashboard → confirm the canonical `ExecutorDriftOp` shape covers their needs. If not, schema-evolve it before adding more writers.

## Cross-references

- `decisions/2026-05-19-guild-automation-module-executors.md` — parent ADR; this fulfills the "persist drift automatically" promise.
- `decisions/2026-05-20-guild-automation-executor-composition.md` — sibling ADR (composition root); shares the orchestrator reader path.
- `decisions/2026-05-20-guild-automation-executor-partial-failure.md` — sibling ADR (apply-result shape); the `ExecutorApplyResult` it introduces is the input this ADR's reader consumes.
- `packages/shared/src/services/guildAutomation/service.ts:217-243` — current `/plan` drift writer; refactored to canonical shape by this ADR's PR.
- `prisma/schema.prisma:230-242` — `GuildAutomationDrift` model.
- `packages/frontend/src/services/automationApi.ts` — current drift consumer; reads `severity` + `updatedAt` only.
- This ADR was produced via `/research-and-decide` during a `/grill-me` session on PR #906.
