# Contributing to Lucky

Thanks for working on Lucky. This file documents the small repo-specific rules that are easy to miss; everything else (style, tests, formatting) is enforced by CI and lives in code.

## Getting started

```bash
git clone https://github.com/LucasSantana-Dev/Lucky.git
cd Lucky
pnpm install
pnpm --filter @lucky/bot exec jest --testPathPatterns='your-area'
```

Per-package quick refs:

- **Bot tests** — `pnpm --filter @lucky/bot exec jest`
- **Backend tests** — `pnpm --filter @lucky/backend test`
- **Frontend dev** — `pnpm --filter @lucky/frontend dev` (Vite)
- **Frontend e2e** — `pnpm --filter @lucky/frontend test:e2e` (Playwright)

The active backlog lives at `.claude/plans/backlog-YYYY-MM-DD.md`; the most recent file is canonical. Tracked specs live under `docs/specs/YYYY-MM-DD-*/`.

## Pull request checks

Branch protection on `main` requires:

- `Quality Gates` (CI/CD Pipeline — jest + lint + typecheck)
- `Security` (CI/CD Pipeline — secret scan + audit)
- `SonarCloud Code Analysis` (Quality Gate, includes ≥ 80% new-code coverage)

Plus the repo *ruleset* (separate from legacy branch protection — visible only via `gh api /repos/.../rules/branches/main`) adds:

- `portability` (path-portability check)
- `SonarCloud Scan`
- `GitGuardian Security Checks`
- **`required_review_thread_resolution: true`** — every PR review thread must be marked Resolved before merge, even after the parent review is dismissed.

## Resolving review threads on merge

If your PR shows `mergeStateStatus: BLOCKED` while:

- all required status checks are SUCCESS,
- `reviewDecision` is empty (no `CHANGES_REQUESTED`),
- branch is up-to-date with `main`,
- no merge conflicts,

…the cause is almost always **unresolved review threads** under the ruleset. The legacy `branches/main/protection` API does not surface this rule, so it doesn't appear in `gh pr view` checks output.

**Diagnose:**

```bash
gh api graphql -f query='
  query {
    repository(owner:"LucasSantana-Dev", name:"Lucky") {
      pullRequest(number: <PR>) {
        reviewThreads(first: 50) {
          nodes { id isResolved comments(first: 1) { nodes { path body } } }
        }
      }
    }
  }' --jq '.data.repository.pullRequest.reviewThreads.nodes[] | select(.isResolved==false)'
```

**Fix:** mark each unresolved thread as resolved.

```bash
gh api graphql -f query='
  mutation { resolveReviewThread(input: { threadId: "PRRT_..." }) { thread { isResolved } } }'
```

Note: dismissing the parent review (`PUT /repos/.../pulls/N/reviews/REVIEW_ID/dismissals`) does **not** auto-resolve its inline threads — the threads outlive the review record. Both steps are usually required when the bot review is stale.

## Re-triggering CI after retargeting a stacked PR

`gh pr edit <N> --base main` flips the base branch but does **not** fire workflows whose trigger is `pull_request: branches: [main]` — GitHub dispatches `pull_request.edited` (which most workflows don't subscribe to), not `synchronize`. Required checks then never run on the existing head SHA and `mergeStateStatus` stays BLOCKED indefinitely.

**Fix:** push an empty commit immediately after retargeting:

```bash
git commit --allow-empty -m "ci: re-trigger workflows after PR retargeted to main"
git push origin HEAD:<branch>
```

Closing and reopening the PR works too but loses any auto-merge arming.

## Stacked PRs and `gh pr merge --auto`

`gh pr merge --auto` does **not** rebase a `BEHIND` branch when `main` advances. When a stacked PR ahead of yours lands, your PR will go BEHIND and stop being a merge candidate even if all checks were previously green. Sweep with `gh pr update-branch` after each `main` advancement, or run a small watcher script that polls and rebases on transition.

## CodeRabbit reviews

CodeRabbit's `@coderabbitai review` trigger is sometimes ignored after a fix push (~10+ min, no fresh review). When that happens, you can dismiss the stale `CHANGES_REQUESTED` review directly:

```bash
gh api -X PUT "/repos/LucasSantana-Dev/Lucky/pulls/<PR>/reviews/<REVIEW_ID>/dismissals" \
  -f message="Addressed in commit <SHA>: <one-line summary>"
```

Always pair the dismissal with the **thread-resolution** recipe above — dismissing the review does not auto-resolve the inline threads.

## Hard rules

- Never `--admin`, `--no-verify`, `--no-gpg-sign`, or force-push to `main`.
- Never delete `pnpm-lock.yaml` or per-package lockfiles to "fix" install issues.
- Never commit `.env`, `*.key`, or anything matched by GitGuardian's secret patterns.
- Worktrees go under `/Volumes/External HD/Desenvolvimento/.worktrees/` if you're developing on the maintainer's machine; otherwise `~/.worktrees/lucky-*` is fine.

## Reporting security issues

See `SECURITY.md` (when present) or open a private security advisory at https://github.com/LucasSantana-Dev/Lucky/security/advisories/new.
