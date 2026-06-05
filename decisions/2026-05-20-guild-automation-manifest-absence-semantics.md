---
status: accepted
date: 2026-05-20
revisit_after: 3-months-or-after-PR-7-roles-executor
---

# Guild Automation Module Executors emit a per-op `protected` flag; manifest absence is a disable-intent under protected reconcile

The AutoMessages executor (`packages/shared/src/services/guildAutomation/autoMessagesExecutor.ts:82-113`) currently has two intertwined problems:

1. **Bug.** `if (!want?.message) → noop`. An operator who writes `{ welcome: { enabled: false } }` (clear intent to disable) gets a noop. The `enabled` field is silently ignored when no message is set.
2. **Outlier semantics.** AutoMessages has zero stale-prune behavior under `allowProtected: true`. Every other module (Roles, Channels, ReactionRoles, CommandAccess, Onboarding, Moderation) treats manifest absence or empty-section as authoritative under protected reconcile and either prunes or overwrites. AutoMessages alone preserves silently. This is invisible inconsistency that will surprise operators.

This ADR fixes both: AutoMessages joins the rest of the system's `allowProtected` convention by adding a `protected: boolean` flag to each `AutoMessagesDiffOp`. The orchestrator's pre-existing `allowProtected` gate (used by every other module via `shouldApplyModule`) is mirrored at the executor-op level via a simple diff-op filter. Locks in the pattern that the remaining 6 executors will inherit.

## Context

- `GuildAutomationExecutionService.ts:181-191` defines `shouldApplyModule(plan, module, allowProtected)` which filters legacy plan operations by `(allowProtected || operation.protected === false)`. Every module today uses this filter at the plan level.
- The executor seam moves "what to do" from the plan (filtered) into the executor's own `diff()`. AutoMessages's `AutoMessagesDiffOp` does NOT carry a `protected` flag today, so the existing filter cannot reach executor-emitted ops. The orchestrator is structurally blind to executor-level protectedness.
- Critic feedback (2026-05-20 grilling session) flagged the silent-disable risk: under `allowProtected: true`, an operator who forgets the `automessages` block in a manifest update loses their welcome/leave messages.
- The silent-disable risk is **symmetric with what Roles and Channels already do** — operator forgetting to include a role in the manifest, under `allowProtected: true`, causes role deletion (more destructive than auto-message disable; auto-message disable is reversible by editing the row, role deletion takes channel-permission rebuild). Operators already accept this contract for the bigger-blast modules.
- `allowProtected: true` is not a default — it's an explicit operator opt-in for "destructive reconcile" runtypes. The same opt-in that disables stale roles will disable absent auto-messages. The contract is uniform.

## Decision

1. **Add `protected: boolean` to every `AutoMessagesDiffOp` variant** (`create`, `update`, `noop`). Define semantics:
    - `protected: false` — safe addition or in-place update; applies under any `allowProtected`.
    - `protected: true` — destructive or disable op; only applies when orchestrator passes `allowProtected: true`.

2. **Add optional `reason?: string` field on `update` ops.** Surfaces operator-visible explanation. Initial values: `'manifest-explicit-disable'` (operator set `enabled: false`), `'manifest-section-absent'` (operator omitted the section under protected reconcile). The `reason` is recorded into `ExecutorDriftOp.reason` (drift persistence ADR) and into Sentry breadcrumbs when the op applies.

3. **Diff logic (replacing the buggy `if (!want?.message)` short-circuit):**

    ```ts
    const wantAbsent = want === undefined
    const wantExplicitDisable = want?.enabled === false
    const wantHasMessage = !!want?.message

    if (wantAbsent && have === null) {
        ops.push({ kind: 'noop', type, protected: false })
        continue
    }
    if (wantAbsent && have !== null) {
        ops.push({
            kind: 'update',
            type,
            id: have.id,
            enabled: false,
            protected: true,
            reason: 'manifest-section-absent',
        })
        continue
    }
    if (wantExplicitDisable && have !== null) {
        ops.push({
            kind: 'update',
            type,
            id: have.id,
            enabled: false,
            message: want.message, // may be undefined; OK
            channelId: want.channelId,
            protected: true,
            reason: 'manifest-explicit-disable',
        })
        continue
    }
    if (wantHasMessage && have === null) {
        ops.push({
            kind: 'create',
            type,
            message: want.message,
            channelId: want.channelId,
            protected: false,
        })
        continue
    }
    if (wantHasMessage && have !== null) {
        ops.push({
            kind: 'update',
            type,
            id: have.id,
            message: want.message,
            channelId: want.channelId,
            enabled: want.enabled,
            protected: false,
        })
        continue
    }
    ops.push({ kind: 'noop', type, protected: false })
    ```

4. **Orchestrator pre-filters the diff before calling `apply()`.** Mechanism:

    ```ts
    const filteredOps = diff.ops.filter((op) => allowProtected || !op.protected)
    const result = await executor.apply({ ops: filteredOps }, ctx)
    ```

    Keeps `ExecutorContext = { guildId }` unchanged. The orchestrator owns the policy gate; the executor's `diff()` is pure (returns all ops, lets the caller decide which to apply). Backend's `GuildAutomationExecutionService` and bot's `applyPlan.ts` apply this filter symmetrically with their existing `allowProtected: boolean` argument.

5. **The pattern is the seam standard.** PRs #2-#7 of the executor sequence (Moderation, ReactionRoles, CommandAccess, Onboarding, Channels, Roles) inherit `protected: boolean` on their diff ops. Roles/Channels naturally map their existing `pruneStaleRoles()` / `pruneStaleChannels()` paths onto `delete` ops with `protected: true`.

6. **Lands in the drift-persistence PR (PR_Y).** Same file, same orchestrator reader path, same spec suite as the drift ADR. Bundling avoids a 4th PR off `release/v2.11.0`.

## Considered options

- **α. Bug-fix only (preserve-on-omit, regardless of `allowProtected`).** Rejected. Fixes the `enabled: false` bug but leaves AutoMessages as the system outlier. Inconsistency between modules — operators running protected reconcile see roles/channels/grants cleaned up but auto-messages preserved with no explanation. ~10 LOC change. Lighter, but the consistency cost compounds over time as more operators encounter the asymmetry.
- **β. Bug-fix + match-other-modules via per-op `protected` flag (accepted).** ~30 LOC executor delta + ~15 LOC orchestrator delta + 5 new spec cases. Locks in the per-op-protected pattern across all 7 executors. Matches existing system convention.
- **γ. Strict source-of-truth (no `allowProtected` concept, manifest absence always disables).** Rejected outright. Inconsistent with every other module (each of which requires `allowProtected: true` for destructive behavior). Would surprise operators authoring partial manifest tweaks.
- **δ. Extend `ExecutorContext` to carry `allowProtected`; let `apply()` filter internally.** Rejected. Pushes policy into each executor instead of keeping it at the orchestrator. Forces every executor author to remember the filter. Pre-filtering in orchestrator is cleaner separation of concerns.
- **ε. Add a new diff kind `'disable'` distinct from `'update'`.** Rejected. The Prisma `AutoMessage` model already has an `enabled` boolean column — disable IS an update with `enabled: false`. A separate kind would split the apply logic for no semantic gain.

## Consequences

**Positive**

- AutoMessages joins the rest of the system's `allowProtected` convention. Operators running protected reconcile get uniform behavior.
- The `enabled: false` bug is fixed as a side effect of the diff rewrite (explicit-disable case now respected).
- Locks the per-op-protected seam standard for the remaining 6 executors. Roles/Channels migration becomes straightforward (their `pruneStaleX()` logic translates directly to `delete` ops with `protected: true`).
- `reason` field surfaces "why was this op generated" into drift records and Sentry — operator-visible answer to "what happened to my welcome message."
- Orchestrator pre-filter keeps `ExecutorContext` minimal; executor `diff()` stays pure.

**Negative**

- The critic's silent-disable risk is real but bounded: requires (1) operator authors a partial manifest forgetting `automessages`, AND (2) operator explicitly triggers `allowProtected: true` reconcile. Same risk profile as forgetting a role under protected reconcile — a known operator workflow contract.
- `AutoMessagesDiffOp` gains a `protected: boolean` field; every consumer (test fixtures, future executor patterns) must populate it. ~5 LOC churn per consumer.
- Three new diff-op cases in spec (5 total) — each must explicitly assert `protected` and `reason` values. Spec file grows ~80 LOC.

**Neutral**

- Schema unchanged. No Prisma migration.
- `ExecutorContext` unchanged.
- Bot vs backend orchestrator logic stays symmetric (both filter using their existing `allowProtected` param).

## Revisit when

- **3 months into production OR after PR #7 (Roles Executor) lands**, whichever first. Concrete signals to flip back to α:
    - ≥2 support tickets per quarter about "my welcome message disappeared after a manifest update" where the operator did not intend to disable. Investigate: was `allowProtected: true` set unintentionally?
    - Operator UX research shows the `allowProtected: true` runtype is being triggered without operator understanding (e.g. a default scheduled reconcile uses it).
- **Any of the 6 remaining executors discover that `protected: boolean` per op is the wrong granularity.** Plausible: an executor with both per-op and module-level protection (e.g. "this whole module is destructive, gate at module level not per op"). Would shift back toward `shouldApplyModule`-style module-level gating.
- **Lucky redesigns the manifest schema to use explicit `null` for "delete" vs `undefined` for "preserve".** Would deprecate this ADR's "absence = disable under protected" mapping in favor of explicit operator intent.
- **A new manifest module type emerges where "absent = preserve" is genuinely required regardless of `allowProtected`** (e.g. operator-authored content that must never be auto-disabled). Would require a per-module opt-out from the convention.

## Cross-references

- `decisions/2026-05-19-guild-automation-module-executors.md` — parent ADR; this fulfills the "executors own stale-pruning per module" promise with the protected-flag mechanism.
- `decisions/2026-05-20-guild-automation-executor-composition.md` — sibling ADR (composition root).
- `decisions/2026-05-20-guild-automation-executor-partial-failure.md` — sibling ADR; `ExecutorOpError.reason` mirrors this ADR's `reason` field semantics.
- `decisions/2026-05-20-guild-automation-drift-persistence.md` — sibling ADR; `ExecutorDriftOp.reason` is populated from this ADR's `reason` field.
- `packages/backend/src/services/GuildAutomationExecutionService.ts:181-191` — existing `shouldApplyModule` filter, the precedent this ADR mirrors at the executor-op layer.
- `packages/bot/src/utils/guildAutomation/applyPlan.ts:54-64` — bot's equivalent.
- `packages/shared/src/services/guildAutomation/autoMessagesExecutor.ts:82-113` — diff function being rewritten.
- This ADR was produced via `/research-and-decide` during a `/grill-me` session on PR #906.
