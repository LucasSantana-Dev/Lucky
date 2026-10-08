---
name: next-priority
description: Decide the highest-value safe thing to do right now in the active repo or workspace.
triggers:
    - next priority
    - what should happen now
    - triage this repo
---

# next-priority

Choose the next action using evidence, not intuition.

## Decision order

This list is the SINGLE canonical ranking (references/priority-rules.md holds
PR-state interpretation detail, not a second ranking).

1. Merge-ready PRs
2. Release blockers
3. Failing CI, flaky tests, or stale-base PRs blocking merges (stale-base = PR
   targets a branch already merged into default; retarget before it can ship)
4. Security issues with a known safe fix
5. Overdue date-gated commitments — "re-check X by <date>" items from handoffs
   and memory whose date has passed (scan command in references/scan-commands.md)
6. Small production-ready fixes or features
7. Concrete tech debt slowing delivery
8. Refactors justified by churn or repeated friction
9. Deferred migrations or speculative work

### Act or ask (single canonical rule)

Pick the action, then act per the autonomy tiers in `~/.claude/standards/autonomy-tiers.md`
(ADR-0051) and `~/.claude/CLAUDE.md` "Autonomy". This is the only place that states it:

- T0 / T1 (reads, discovery, planning, branch commits, edits under 5 files, claiming or
  starting a task, creating a plan): proceed and report. No confirmation stop.
- T2 (merges, multi-module refactors, architecture/API/schema changes): one adversarial critic
  pass (different tier, mechanical checks first), then proceed; log the gate.
- T3 (destructive, irreversible, production, other-author PRs, money, outward publishes,
  history rewrites): ask the human before executing. This skill chooses, it never bypasses gates.

### Waiting for CI is never a priority

"Merge-ready PRs" (rank 1) means a PR whose checks have **already passed** and is
mergeable now. A PR whose CI is **still running** is NOT merge-ready and NOT a
priority — never pick "wait for / poll the PR's CI" as the next action. CI
completion re-surfaces the PR via its own notification; until then, drop to the
next actionable item and do real work. **Sole exception:** the next task is
blocked _on that exact code_ — it needs the in-flight branch's changes to
proceed. Only then is the in-flight PR the gating item, and even then advance any
independent work first. Idle-polling an in-flight PR is a priority-inversion.

## Required evidence

Check, in order:

- active handoff
- overdue date-gated items (handoffs + memory date scan — see scan-commands.md)
- active plan
- current branch and open PRs
- CI status on the current branch / HEAD
- open review comments or blocking issues
- recent commits and working tree state

Staleness rule: if any gathered evidence predates the repo's last commit
(`git log -1 --format=%ct` vs when the evidence was produced), flag it in the
output and re-gather that item before committing to a verdict. Advisory only —
never auto-rerun expensive pipelines.

## Output

Signal-first: one-line verdict before detail.

```
Priority: <single action>
Why: <one-line reason it outranks alternatives>
Blocked by: <what stops it, or "nothing">
Next step: <smallest concrete action>
```

Do not list every alternative considered — only surface the top action and its nearest competitor if the choice was close.

## Blocker escape hatches

When the top candidate is blocked, apply the matching pattern before falling back to the next priority:

| Blocker                                           | Pattern                                                                                                                                                      |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Self-approve blocked on own PR                    | Branch protection requires review you can't give yourself. Branch protection blocks: surface to the user (T3), never toggle `enforce_admins` or admin-merge. |
| Webhook desync (PR head SHA stale)                | Close the PR + open a fresh PR from same branch. Empty-commit nudges rarely fix it.                                                                          |
| PR `mergeStateStatus: BEHIND`                     | `gh pr update-branch` first; if 422 conflict, local rebase + force-push-with-lease                                                                           |
| `CONFLICTING` but local `git merge-tree` is clean | Webhook desync — same recipe as above                                                                                                                        |
| All open PRs blocked on outside review            | Write the smallest unblocking comment (clarify scope, link tests, ping reviewer). Escalate to user if >24h stuck.                                            |
| Everything blocked + plans exist                  | Execute Phase 1 of the earliest-dated plan. Phase 1 is usually inventory/read-only and safe to advance unilaterally.                                         |
| Nothing actionable                                | Run a diagnostic skill (`/hook-effectiveness`, `/skill-effectiveness-audit`, `/config-drift-detect`) instead of inventing work.                              |
