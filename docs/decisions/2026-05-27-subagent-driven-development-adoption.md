# ADR: Subagent-Driven-Development Pattern Adoption

**Date:** 2026-05-27  
**Status:** Decided — Rejected

---

## Context

The `subagent-driven-development` skill defines a pattern for implementing plans: one fresh subagent per task + a mandatory two-stage review loop (spec compliance first, then code quality) with SEQUENTIAL task execution — one task completes its full review cycle before the next begins.

Lucky already has:

- Four active `pr-review-toolkit` agents (code-reviewer, pr-test-analyzer, silent-failure-hunter, type-design-analyzer) covering code quality post-implementation
- A `grill-with-docs` / `plan` workflow validating specs before implementation begins
- A CLAUDE.md hard rule: "Parallel execution is mandatory for ≥2 independent tasks"
- ADR `2026-05-23-bot-phase4-execution-strategy.md` explicitly rejecting sequential execution: "Issues are independent; sequential execution wastes available parallelism and is explicitly prohibited for ≥2 independent tasks per project workflow standards."

---

## Decision

**Reject full or partial adoption of the subagent-driven-development sequential execution model.**

The review-pattern-only variant (adopt two-stage review, keep parallel dispatch) was evaluated as Option 2 but rejected: it requires reversing the parallel-execution mandate and four existing ADRs to be internally consistent, and the quality gap it addresses (spec compliance drift between plan-write and PR-open) is non-urgent and not yet measured.

The `pr-review-toolkit` agents run post-implementation and catch the code quality surface. The grill/plan workflow validates specs upstream. This is sufficient for the current scale.

---

## Alternatives considered

| Option                                                             | Why rejected                                                                                    |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Full adoption (sequential + two-stage review)                      | Hard conflict with CLAUDE.md parallel mandate and ADR 2026-05-23-bot-phase4-execution-strategy  |
| Review-pattern-only (two-stage review, parallel dispatch)          | Internally contradicts existing hard rules; quality gap is real but unquantified and non-urgent |
| Selective sequential (use skill's decision tree for coupled tasks) | Equivalent to review-pattern-only in practice; same contradictions                              |
| Defer                                                              | Not chosen — evidence was sufficient to decide                                                  |

---

## Consequences

- **Positive:** No process overhead. No ADR contradiction. Parallel execution mandate preserved.
- **Negative:** Spec compliance drift at PR boundary is not formally gated. Mitigated by upstream grill/plan validation and code-review toolkit catching type/logic errors.
- **Neutral:** The pattern remains available in `~/.agents/skills/subagent-driven-development/` for future evaluation.

---

## Revisit when

- Measured data shows ≥5% of merged PRs deviate from spec in ways the current toolkit misses
- Lucky explicitly decides to abandon the parallel-execution mandate (requires its own ADR)
- Post-production incidents trace to spec drift between plan-write and PR-open
