# ADR — Branch strategy: no PR stacking, worktrees for parallel work

- **Date:** 2026-05-09
- **Status:** Accepted
- **Owner:** Lucas Santana
- **Related:**
  `docs/decisions/2026-05-09-bot-test-suite-cleanup-strategy.md`
  `feedback_parallel_sessions_branch_churn.md`
  `feedback_gh_pr_merge_delete_branch_local_state.md`

## Context

During phase-2 of the bot test cleanup (2026-05-09 session), three independent
refactors of independent spec files (`youtubeErrorHandler`,
`queueStateManager`, `spotifyApi`, `lastFmApi`) were stacked as branches
because each subsequent refactor was ready before the previous one's PR
review cleared:

```
release/v2.10.0
  └── test/suite-redesign-phase2          (PR #836, BLOCKED on REVIEW_REQUIRED)
        └── test/suite-redesign-phase2-batch2  (no PR, depends on #836)
              └── test/suite-redesign-phase2-batch3  (no PR, depends on batch2)
```

This created compounding rebase debt: when #836 eventually merges, batch 2
must rebase against `release/v2.10.0`, then batch 3 must rebase against the
new state of batch 2, and reviewers must re-verify each rebased diff.

The *cause* was a review bottleneck (Greptile hit its 50-review trial limit;
the repo's ruleset requires non-author approval; no second human reviewer is
on-call), not a workflow problem the developer could solve mechanically.

## Decision

**Open at most one PR at a time per repository.** When work on a follow-up
refactor is ready before the predecessor PR merges:

1. Commit the work to a branch (don't lose it).
2. Use a git worktree (`/Volumes/External HD/Desenvolvimento/.worktrees/`)
   for parallel development without polluting the main checkout's HEAD.
3. **Do NOT push the follow-up's PR.** Wait for the predecessor to merge,
   then rebase the follow-up branch onto the freshly-merged base, push, open
   PR.

Stacked-diff tooling (Graphite, spr, jj+GitHub) is **not adopted at this
time** because the bottleneck is review approval, not stacking mechanics.
Graphite would polish the rebase cascade but not the root cause.

## Consequences

**Positive:**
- Reviewers see one diff at a time, not three layers of "this depends on #X".
- No rebase cascade when predecessor merges — only the immediate next branch
  rebases, and only once.
- No tool/SaaS dependency added to the workflow.
- Aligns with the existing `feedback_parallel_sessions_branch_churn.md`
  guidance to use worktrees for long-lived parallel work.

**Negative:**
- Throughput penalty when review is slow: independent work waits behind
  unrelated review delays.
- Discipline burden: easy to forget the rule when momentum is high (this
  session's mistake).

**Neutral:**
- The work isn't lost; branches still exist locally and on remote, just
  without PRs until the predecessor merges.

## Alternatives considered

- **Stacked-diff via Graphite (`gt`).** Rejected: solves rebase mechanics
  cleanly but doesn't address the review bottleneck. Adds SaaS dependency.
  Cost ≈ $0/mo on free tier today, opaque trajectory.
- **`spr` (Sourcegraph) or `gh-stack`.** Rejected for same reason as
  Graphite, with worse polish.
- **Jujutsu (`jj`) with GitHub backend.** Rejected: workflow shift too large
  for a solo-dev with a stable existing tool chain. Revisit if the team grows.
- **Trunk-based development with feature flags.** Rejected: test-suite
  refactors can't be feature-flagged at runtime.
- **Local change-stack (squash-rebase before PR).** Rejected: loses the
  per-batch checkpoint history that makes review tractable.

## Revisit when

Re-open this decision and evaluate Graphite (or jj) specifically if **all**
of the following become true:

1. A second reliable reviewer is added — paid Greptile, CodeRabbit configured
   as a *blocking* required reviewer, or a co-maintainer.
2. Independent refactor work consistently piles up at ≥2 stacked branches per
   week for 4+ weeks.
3. The current "wait for merge, then rebase" rule is creating ≥1 day of
   throughput delay per week as measured against capability.

If review remains the bottleneck, this decision stays — branch strategy is
downstream of review capacity.

## Operational rule (machine-readable)

For future sessions, the rule the agent SHOULD enforce:

```
Before pushing a branch and opening a PR:
  1. Check whether ANY open PR exists from the same author against the
     same base branch.
  2. If yes: do NOT push the new PR. Park the branch (push branch only,
     no `gh pr create`), document the queue position in
     `.agents/memory/in-progress.md`.
  3. After predecessor merges: rebase, force-push with --force-with-lease,
     open PR.
  4. Worktrees are encouraged for ongoing work to keep HEAD stable.
```

## References

- Phase-2 stacking incident: this session, branches
  `test/suite-redesign-phase2{,-batch2,-batch3}` created 2026-05-09.
- `feedback_parallel_sessions_branch_churn.md` — earlier worktree guidance.
- `feedback_gh_pr_merge_delete_branch_local_state.md` — adjacent gotcha
  about HEAD churn after deleted branches.
