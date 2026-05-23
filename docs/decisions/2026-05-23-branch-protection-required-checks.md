# ADR: Branch Protection Required Status Checks for `main`

**Date:** 2026-05-23  
**Status:** Accepted

## Context

Lucky's `main` branch had three required status checks: `Quality Gates`, `Security`, and `SonarCloud Scan`. A gap was identified: `madge / packages/bot` (the circular dependency gate) was supposed to be promoted to a required check when PR #889 landed (per ADR `2026-05-16-next-refactor-target-bot-circular-deps.md`), but the promotion was never executed. The promotion code had been written on branch `ci/madge-gate-blocking` (PR #945) and left stranded.

### CI structure at time of decision

```
checks (Checks — build/lint/typecheck)
test-backend (Test — backend)
test-bot (Test — bot)
test-frontend (Test — frontend)
   ↓ all four feed into:
quality-gate (Quality Gates)  [needs all 4, if: always(), asserts all == "success"]
sonar (SonarCloud Scan)       [needs test-*]
security (Security)           [independent]

madge.yml:
circular (madge / packages/bot)  [was: continue-on-error: true, audit-only]
```

### Question

What required status checks should be added to `main` branch protection?

## Candidates evaluated

| Option                                  | Verdict      | Reason                                                                                                         |
| --------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------- |
| Status quo                              | Rejected     | Known gap: madge promotion from #889 never executed                                                            |
| Add `Checks` explicitly                 | Rejected     | Redundant — `Quality Gates` has `if: always()` + `needs: [checks, ...]` + hard `exit 1`; no bypass path exists |
| Add individual test jobs                | Rejected     | Same redundancy with `Quality Gates` indirection; 3 extra strings to maintain                                  |
| Add `madge / packages/bot` (baseline=1) | **Accepted** | Closes the planned-but-missed promotion; baseline allows 1 known residual cycle                                |
| Add `madge` after fixing last cycle     | Deferred     | Extra PR required first; no immediate safety gain vs. baseline=1                                               |

## Decision

Add **`madge / packages/bot`** to the required status checks on `main`.

The `Quality Gates` indirection correctly covers build, lint, typecheck, and all test suites. Adding individual job names as required checks would create maintenance debt (string-match fragility on job rename) with no safety gain.

The `madge / packages/bot` check was the only genuinely uncovered gap: it runs in a separate workflow (`madge.yml`) outside the `Quality Gates` dependency graph, so `Quality Gates` cannot cover it.

### Baseline

`madge / packages/bot` hard-gates at `COUNT > 1`. The 1 allowed residual is:

```
types/CustomClient.ts → models/Command.ts → types/CommandData.ts
```

All three imports in this cycle are `import type` (erased at compile time). Breaking it requires moving the shared type to a new file and updating the command-loader consumers (`help.ts`). Deferred pending command-loader contract review.

### Dependabot safety

Dependabot PRs that introduce no new bot cycles will still report `COUNT = 1`, which is NOT `> 1` — they pass cleanly. Only a Dependabot update that accidentally introduces a new import cycle would fail, which is correct and desired behavior.

## Consequences

**Positive:**

- New circular dependencies in `packages/bot` are now blocked at merge time, not discovered later.
- Closes the planned promotion documented in `2026-05-16-next-refactor-target-bot-circular-deps.md`.

**Negative:**

- The required check string `madge / packages/bot` must be updated if the job is renamed.

**Neutral:**

- `Quality Gates` continues to cover `Checks`, `Test — backend`, `Test — bot`, and `Test — frontend` indirectly. This design is intentional: one named aggregator is easier to reason about than four parallel required strings.

## Revisit when

- The remaining `CustomClient → Command → CommandData` cycle is resolved → lower baseline to 0, update the `madge.yml` threshold.
- A madge job rename occurs → update the required check string in branch protection.
- `Quality Gates` indirection proves insufficient in practice (e.g., a required check bypass is observed) → add `Checks` and individual test jobs explicitly.
