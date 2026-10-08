# Backlog Skill Stop Conditions & Handling

| Condition                                                                         | Action                                                                                                                                                                               |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Not in a git repo                                                                 | Abort at Phase 1. Reconcile: `Discover: (failed: not a git repo)`.                                                                                                                   |
| `gh auth status` fails before Phase 1                                             | Continue with `gh_available=false`. Phase 1 still gathers git/code markers. Phase 6 halts with `Issues: (failed: gh not authenticated — run gh auth login)`. Plan file is preserved. |
| `audit-deep` returns 0 findings AND no code markers AND no ecosystem-health drift | Write `.claude/backlog/<date>-empty.md` (just header, no tasks). Skip Phases 2-7. Reconcile shows `Discover: 0 findings — repo clean`.                                               |
| User responds "none" in Phase 3                                                   | Skip Phases 4-7. Reconcile: `Propose: 0 approved`, all later phases `(skipped: user rejected all)`. Plan file preserved as draft.                                                    |
| Project board missing AND user declines creation in Phase 7                       | Skip Phase 7 only. Issues stay created with labels. Reconcile: `Board: (skipped: user declined creation)`.                                                                           |
| Network/API failure during issue creation                                         | Continue creating remaining issues. Failed ones marked `(failed: <reason>)`. No rollback.                                                                                            |
| Plan file already exists for today                                                | Append `-1`, `-2`, etc. suffix. Never overwrite.                                                                                                                                     |
| User Ctrl-Cs mid-run                                                              | Not catchable from skill logic. Plan file is always written before issue creation, so resume = manually run `/plan-to-issues` on existing plan file.                                 |

## Reconciliation Rules

- Every declared phase has a line — never silently omit
- Skipped phases marked `(skipped: <reason>)`
- Failed phases marked `(failed: <reason>)` and chain continues
- Print reconciliation block verbatim at end — no exceptions

## Negative Rules

- Do NOT create issues without explicit user approval in Phase 3
- Do NOT skip the reconciliation block under any condition
- Do NOT create duplicate issues — always dedup against `gh issue list --state open`. If user explicitly says `keep dup`, allow it but flag in reconcile as `Issues: <list> (1 known duplicate kept per user request)`
- Do NOT run cross-repo — single-repo scope only. `/ecosystem-health` is multi-repo entry point. If user asks for cross-repo backlog, redirect them.
- Do NOT silently bail on any phase — every declared phase has a reconcile line
- Do NOT create issues without evidence (file paths, line numbers, log excerpts, or commit refs). If a finding lacks evidence, drop it before Phase 3.
- Do NOT generate specs for bugs / refactors / docs / tests / perf / security / tech-debt — only `category == feature`. Specs for everything else are over-engineered.
- Do NOT modify production code — `/backlog` is read-only for application code. Only writes plan, spec, config, label, and memory files.
- Do NOT auto-create the Active Backlog Project without explicit user `y` confirmation on first run (composite-contract's no-silent-bail-out).
- Do NOT re-invoke `/audit-deep` mid-run if it just completed — Phase 1 runs it exactly once. Reuse its output memory file for Phase 2.
