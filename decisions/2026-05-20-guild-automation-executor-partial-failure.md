---
status: accepted
date: 2026-05-20
revisit_after: 6-months-or-after-PR-6-channels-executor
---

# Guild Automation Module Executors return a discriminated-union result and apply ops best-effort

The parent ADR `decisions/2026-05-19-guild-automation-module-executors.md` set the cross-executor rollback strategy (partial-success across executors, reconcile-on-next-Run). This ADR locks down behavior **within** a single executor's `apply()` method. Each executor will run its ops best-effort with per-op try/catch and return an `ExecutorApplyResult<T>` discriminated union with `'success' | 'partial' | 'failed'` shapes. The current sequential `for..of` in `packages/shared/src/services/guildAutomation/autoMessagesExecutor.ts:115-143` will be rewritten to this shape in the same PR that drops the singleton (see ADR `2026-05-20-guild-automation-executor-composition.md`).

## Context

- The current monolith (`packages/backend/src/services/GuildAutomationExecutionService.ts:719-778`) and the bot apply path (`packages/bot/src/utils/guildAutomation/applyPlan.ts:89-188`) are both fail-fast at op level — first failed op rethrows. Stale-pruning catches expected delete errors (403/404, Discord codes 50013/10003/10008) but apply-create/edit ops always propagate.
- `discordRequest` (`GuildAutomationExecutionService.ts:351-395`) has zero retry: a single fetch, throw on `!response.ok` or network error. Transient 429 / 5xx already kills the op today, with no centralised retry layer above the executor.
- `GuildAutomationRun.operations` is a Json column (`prisma/schema.prisma:209-228`); per-op detail is _schema-allowed_ but never populated by the current monolith. `GuildAutomationRun.error` is a single String — module-level outcome only.
- Realistic op counts: Roles 2-10, Channels 5-30, AutoMessages/Moderation/ReactionRoles/CommandAccess 1-3 each. Channels at 30 ops + zero retry + real Discord 429s is the worst case worth designing for.
- The seven-executor extraction is mid-flight. AutoMessages is the only executor implemented (commit `a2b0c8a7`, PR #906). Locking the apply-result shape now means six follow-up executors inherit it; deferring means a coordinated refactor across all seven later.

## Decision

1. **Introduce a unified `ExecutorApplyResult<TApplied>` discriminated union** in `packages/shared/src/services/guildAutomation/executorTypes.ts`:

    ```ts
    export type ExecutorApplyResult<TApplied> =
        | { status: 'success'; applied: TApplied }
        | { status: 'partial'; applied: TApplied; errors: ExecutorOpError[] }
        | { status: 'failed'; error: string }

    export type ExecutorOpError = {
        opIndex: number
        opKind: string
        reason: string
    }
    ```

2. **All seven executors return this union from `apply()`.** No executor throws from `apply()` except for invariant violations (e.g. an op kind the executor doesn't recognise — a programming bug, not a runtime failure).

3. **Per-op try/catch is mandatory inside `apply()`.** On op exception, push an `ExecutorOpError` and continue. At end:
    - empty errors → `'success'`
    - non-empty errors + ≥1 op applied → `'partial'`
    - non-empty errors + zero applied → `'failed'`

4. **Orchestrators persist the full result.** Backend writes `applied` and `errors` arrays into `GuildAutomationRun.operations` Json column. Top-level `GuildAutomationRun.status` becomes `'partial'` when any module returns `'partial'`. Top-level `error` (single String) is set only on a `'failed'` module (or kept as a summary across multiple failures).

5. **Stale-pruning's expected-delete-error swallowing is preserved as a per-op concern** inside the executor. A swallowed expected error does not count toward `errors[]`. Only unexpected errors do.

6. **Land this in the same PR as the singleton removal** (ADR `2026-05-20-guild-automation-executor-composition.md`). Both changes touch `autoMessagesExecutor.ts` + `shared/index.ts` + both orchestrators; combining them avoids redundant spec churn.

## Considered options

- **A. Fail-fast forever (match current monolith).** Rejected. Cheap today but locks in zero per-op visibility. Lucky's `discordRequest` has no retry; a single 429 mid-loop on a 30-op Channels apply reports "channels failed" with no indication that 25/30 succeeded. Reversal cost across 7 executors is high (fork shapes or unified rewrite, plus 7 spec rewrites). The argument "current monolith does this and ships" is true but is a status-quo argument, not a design argument.
- **B. Eager best-effort with discriminated-union result (accepted).** Locks the shape now, paid once at AutoMessages. The other 6 executors inherit a single result contract. Operator visibility into partial-state runs is automatic via `GuildAutomationRun.operations` Json. ~25 LOC of net new code in shared.
- **C. Lazy best-effort (introduce union at PR #6 Channels when op count justifies it).** Rejected. Requires retrofitting AutoMessages + 4 already-shipped executors. Per the critic, lazy introduction is the worst path — pays the migration cost at the worst possible moment (mid-sequence).
- **D. Mixed (DB-only executors fail-fast, Discord-touching best-effort).** Rejected for the same reason option B was preferred to (b) in the parent composition ADR: bifurcated shapes force orchestrators to handle two contracts. Unified union for all 7 — DB-only executors simply never emit `'partial'` in practice — is simpler and at the same cost.
- **E. Best-effort with `{ applied; errors }` shape (no discriminator).** Rejected. Without an explicit `status` discriminator, the orchestrator has to inspect `errors.length > 0` and `applied` size to classify the run, which means each consumer reimplements the same classification logic. The discriminator centralises it.
- **F. Throw at end of `apply()` if any op failed, with `error.partial` attached.** Rejected. Custom Error subclasses with attached partial data are awkward in TypeScript (caller must narrow via `instanceof`), and `throw` is a poor signal when the operation partially succeeded — callers must handle "success-as-throw" semantics that don't compose.

## Consequences

**Positive**

- Operators inspecting a `GuildAutomationRun` see exactly which ops applied and which failed, without comparing two consecutive runs.
- Discord 429-mid-loop on Channels apply produces a `'partial'` run with N/30 applied and the failed op's reason captured. Next Run's `capture` + `diff` reconciles the remaining ops. Operator workflow is one Sentry breadcrumb, not a two-run diff.
- Unified shape across all 7 executors: orchestrators have one reader, not seven. Future cross-cutting features (retry-failed-ops UI, per-op drift granularity, "which roles applied" report) all read from the same JSON shape already in the Run record.
- Locks in the contract while there's exactly one executor to refactor. The other six inherit it.

**Negative**

- ~25 LOC of new code in shared (the type file + executor try/catch loop). Real cost, not free.
- Each executor's `apply()` body grows by ~10 LOC for the try/catch + status classification. Across 7 executors, ~70 LOC overhead.
- Orchestrators must learn to interpret the union, which is more code than "if error throw, else success." But this code lives in one place per orchestrator, not duplicated per module.

**Neutral**

- `GuildAutomationRun` schema unchanged. The Json column already accepts the new structure.
- `GuildAutomationDrift` semantics unchanged.
- Bot's `applyPlan` doesn't persist a Run record — only backend does — so the bot reader is simpler (emit structured `errorLog`, return aggregate to caller).

## Revisit when

- **At PR #6 (Channels Executor) lands.** Confirm best-effort under realistic op counts actually produces the partial-state visibility the operator scenario requires. If Channels apply hitting a 429 produces a `'partial'` result and the Sentry breadcrumb fires cleanly, the design held.
- **After 6 months of production data.** Read `GuildAutomationRun` records: how many are `'partial'`? If <1% over 6 months and no support ticket mentions partial-state confusion, the cost of best-effort wasn't justified — consider folding `'partial'` back into `'failed'`. If ≥5% are partial and operators are routinely inspecting per-op detail, the design paid off.
- **A new executor type needs transactional semantics** (e.g. a future "atomic role+channel grant" operation where partial application is invalid). Such an executor would need to return `'failed'` if any op fails — the union supports that, but the executor would internally manage rollback. No design change needed at the seam level.
- **Discord adds retry semantics natively** (e.g. via library upgrade to a `discord.js` that adds 429 backoff at the request level, or Lucky introduces a global retry adapter). At that point, the partial-state surface should shrink — most transient errors retry transparently before reaching the executor. If the partial rate drops below 0.1% as a result, fold back to fail-fast.
- **Trigger signals to escalate before the 6-month check:** ≥3 partial-state-confusion support tickets per month, OR `GuildAutomationRun.status: 'partial'` rate >20% in any 7-day window, OR Sentry breadcrumb `executor_status: partial` exceeds 1000 events/day.

## Cross-references

- `decisions/2026-05-19-guild-automation-module-executors.md` — parent ADR; this is a refinement of its "Rollback" section.
- `decisions/2026-05-20-guild-automation-executor-composition.md` — sibling ADR; both decisions land in the same PR.
- `packages/shared/src/services/guildAutomation/autoMessagesExecutor.ts:115-143` — the `apply()` method being rewritten.
- `prisma/schema.prisma:209-228` — `GuildAutomationRun` columns confirming Json support for per-op detail.
- `~/.claude/projects/-Volumes-External-HD-Desenvolvimento-Lucky/memory/feedback_wait_for_quality_gates_2026-05-19.md` — verification gate.
- This ADR was produced via `/research-and-decide` during a `/grill-me` session on PR #906 (commit `a2b0c8a7`).
