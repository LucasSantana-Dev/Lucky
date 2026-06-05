# ADR — Bot Phase 4 continuation strategy: rebase #956, stage merges, batch #959-962

- **Date:** 2026-05-23
- **Status:** Accepted
- **Owner:** Lucas Santana
- **Supersedes:** `decisions/2026-05-23-bot-phase4-execution-strategy.md` (staged-pilot ADR — pilot goal achieved by independent execution)
- **Related:** `decisions/2026-05-23-bot-test-reduction-phase4-replacement-strategy.md`, issues #956, #959–962, #964, #966

## Context

The staged-pilot ADR (2026-05-23, same date) called for piloting #958 (P1) and #956 (P3) before
dispatching the remaining 6 issues. While the pilots ran, the user independently merged:

- **#958 (candidateScorer)** — merged as PR #986 → validates P1 pattern ✓
- **#957 (lastFmApi + spotifyApi)** — merged as PR #989 → validates P2 pattern ✓
- **#963 (moderation + automod)** — merged as PR #984 → validates P3 command-handler pattern ✓

This invalidated the pilot gate requirement. Both pilot PRs (#987 for #956, #988 for #958)
were closed by the user as conflicting with the now-advanced main.

**Current state after the independent merges:**

- main is at `c4ff7e42`, 2,853 tests
- Coverage: 67.45 / 64.39 / 62.55 / 67.45 (headroom: +2.45pp statements, +4.39pp branches, +2.55pp functions, +2.45pp lines)
- All three replacement patterns (P1, P2, P3) are now validated in production code
- #956 worktree (`phase4-956`) has 46 tests (vs 114 on main), 12 commits behind main
- Issues #959–962 are unstarted (fresh worktrees needed)
- Issue #958 is stale-open on GitHub (work merged independently)

**Critic assessment (Phase 2):** ACCEPT-WITH-RESERVATIONS.
The full-parallel-batch approach is sound. Two reservations:

1. Rebase #956 worktree rather than starting fresh — ~68 delegation deletions analyzed and
   replaced represent 2–4h of work; rebasing costs ~30min and preserves that analysis.
2. Stage merges: merge #956 first, monitor gate, then merge #959–962 together —
   current headroom (2.45pp) is sufficient but staged merges isolate any gate regression.

## Decision

### Sequence

**Step 1 — Close stale issue (immediate)**  
Close #958 on GitHub (work merged as PR #986).

**Step 2 — Rebase #956 worktree (immediate, ~30min)**  
Rebase `phase4-956` branch onto current main. Resolve conflicts (primarily Prettier
formatting from PR #985). Verify coverage gate with
`npx jest --silent --coverage --coverageReporters=text-summary` from `packages/bot/`.
Push → open PR.

**Step 3 — Merge #956 after CI green**  
Validate gate holds after #956 merges. Coverage delta expected: neutral to slightly
positive (delegation deletions are lightly covered, replacement tests add behavioral
paths).

**Step 4 — Parallel batch #959–962 (after #956 merges)**  
Dispatch 4 independent worktrees simultaneously, each implementing P3 protocol:

| Issue | Scope                                                              | Size       |
| ----- | ------------------------------------------------------------------ | ---------- |
| #959  | `music/` command suites (28 files)                                 | ~271 tests |
| #960  | `management/` command suites (9 files)                             | ~96 tests  |
| #961  | `download/` command suites (6 files)                               | ~92 tests  |
| #962  | `general/` command suites (7 files, 21 it() / 54 toHaveBeenCalled) | ~82 tests  |

Per-worktree protocol: delete delegation cluster → write replacement (≥1 behavioral
assertion, no return-value mocks on SUT) → verify gate → commit → open PR.

**Step 5 — Merge #959–962**  
These are in non-overlapping directories; zero file conflicts. Merge after CI passes
on each. If any single PR drops gate, it can be reverted cleanly.

**Step 6 — Gate tightening (#964)**  
After all 5 issues merged: raise global thresholds from 65/60/60/65 to ~68/63/63/68.
Issue #964 becomes unblocked.

### Target math

2,853 current − ~68 (#956) − ~600 (#959–962 combined, ~150/issue) = ~2,185–2,253 tests.  
Target: ≤2,300 ✓ (conservative estimate already within range).

## Alternatives considered

**Fresh pass on #956 (instead of rebase):** Rejected. The worktree's 46-test result
represents analysis of delegation vs. behavioral assertions already done. Rebasing costs
~30min; a fresh pass costs 2–4h. The P3 pattern is now validated — there is no
information gain from redoing the analysis.

**Full parallel of all 5 issues immediately (#956 + #959–962):**  
Accepted by critic with LOW risk rating. The staged merge recommendation is precautionary,
not mandatory. Given the 2.45pp headroom and that all 5 touch separate file directories,
a simultaneous merge of all 5 PRs would also be safe. The staged approach is preferred
purely to isolate any unexpected gate regression.

**Defer #956 (skip rebase, start only #959–962):**  
Rejected. The #956 worktree's existing replacement tests represent real work that
correctly replaces behavioral assertions — abandoning them wastes the analysis. The
rebased result will still cut ~68 tests from the count.

## Consequences

- **Positive:** All replacement patterns are validated in production; no pilot risk remains.
- **Positive:** #956 worktree analysis is preserved rather than re-done.
- **Positive:** Parallel dispatch of #959–962 respects the mandatory-parallelism rule.
- **Positive:** Staged merges isolate any unexpected gate regression to a single issue.
- **Neutral:** Coverage gate headroom increased from 0.4pp (Phase 3 start) to 2.45pp
  after Phase 3 merged issues — tightening (#964) is safe after this pass.
- **Negative:** #956 rebase adds ~30min of conflict resolution before dispatch.

## Revisit when

- If #956 rebase produces >20 conflicted files: start fresh from main rather than resolving.
  The worktree's replacement tests can be cherry-picked as patches.
- If any single batch merge (#959–962) drops gate: revert that PR, diagnose which
  deletion lacks a sufficient replacement, add replacement, re-open.
- After all 5 merge: check whether ≤2,300 target was met before tightening #964 gate.
