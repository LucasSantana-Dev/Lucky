# Required Checks for Merge

Before any PR can merge, ALL must pass. This is the source of truth for `/pr-merge-readiness` Phase 1.

## Checks (gating merge)

1. **CI green** — all required workflows in `.github/workflows/` pass
2. **Approval** — at least one approving review OR repo's branch protection minimum
3. **No unresolved threads** — CodeRabbit, Greptile, Sonar, human reviewers all done
4. **No merge conflicts** with base branch
5. **Base branch up-to-date** — either branch is current or rebase-on-merge configured
6. **Correct base branch** — base is `main` (trunk-based default). A repo that opted back into the retired release train (`.claude/release-cadence-config.json`) is surfaced to the user, not auto-handled
7. **Regression test present** (hotfixes only) — severity gate documented in PR body

See `standards/pr-conventions.md` for full detail.

## Merge method

- **Default:** squash (one PR = one commit)
- **Exception:** PR explicitly documented as merge-commit intent in body (rare), or a repo `.claude/release-config.json` `mergeMethod` override
- **Never:** rebase-merge unless branch protection requires it

Forbidden: `gh pr merge --admin`, `gh api ... rulesets` mutations (blocked at PreToolUse).
