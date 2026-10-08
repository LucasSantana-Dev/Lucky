---
name: gh-address-comments
description:
    Address review comments on the open GitHub PR for the current branch
    using gh and the repo context. Use when the task is to fetch, interpret, and resolve
    GitHub PR feedback rather than review code from scratch.
triggers:
    - gh-address-comments
    - address pr comments
    - resolve review feedback
    - fix pr comments
    - pr review comments
metadata:
    short-description: Address comments in a GitHub PR review
    owner: global-agents
    tier: contextual
    canonical_source: /Users/lucassantana/.agents/skills/gh-address-comments
invocation_type: internal
---

# PR Comment Handler

Fetch all review comments on a GitHub PR and apply fixes. Works with the current branch's PR or an explicit `--pr <N> --repo <owner/repo>` target.

## Halt check (first)

Before fetching or replying, run the halt check in `merge-confidently` (section
"Other-author PRs: halt"). If it halts, take no action and tell the user.

## Prereq

`gh auth status` must succeed. If it fails, run `gh auth login` first.

## 1) Locate the PR

**Current branch (default):**

```bash
python3 "$HOME/.agents/skills/gh-address-comments/scripts/fetch_comments.py"
```

**Explicit PR in a different repo (fallback):**

```bash
gh api repos/<owner>/<repo>/pulls/<N>/comments | python3 -c "
import json,sys
comments = json.load(sys.stdin)
print(f'{len(comments)} inline comments')
for i,c in enumerate(comments,1):
    print(f'\n--- Comment {i} ---')
    print(f'File: {c[\"path\"]}:{c.get(\"line\",\"?\")}')
    print(f'Author: {c[\"user\"][\"login\"]}')
    print(f'Body: {c[\"body\"][:500]}')
"
# Also fetch review-level comments:
gh api repos/<owner>/<repo>/pulls/<N>/reviews | python3 -c "
import json,sys; reviews=json.load(sys.stdin); [print(r['user']['login'],r['state'],r['body'][:200]) for r in reviews if r['body']]
"
```

## 2) Classify and present comments

Number every comment, classify it (severity: major/minor/nitpick, type: a11y/security/perf/style/logic), and provide a one-line fix summary. Ask the user which comments to address, or proceed with all non-nitpick ones if the user says "address all".

## 3) Verify before fixing

Before editing any file, check whether the issue already exists in the current code:

```bash
grep -n "<pattern>" <file>
```

Only fix issues that are still present. Mark already-fixed ones as resolved.

## 4) Apply fixes

- Work file by file.
- After each file, confirm the fix compiles / lints before moving to the next.
- **Run lint on the FULL target directory, not just changed files** — the pre-commit hook only lints staged files, but CI lints everything. Discrepancy is the most common source of "passes locally, fails on CI":
    ```bash
    npx eslint apps/web/src/__tests__/   # run on the whole dir
    ruff check tests/                     # Python equivalent
    ```
- **Always run the project formatter before committing** — CI will fail on format issues even if the logic is correct:
    ```bash
    # TypeScript / JS projects (Prettier)
    npx prettier --write <files> && npx prettier --check <files>

    # Python projects (ruff)
    ruff format <files> && ruff format --check <files>
    ```
- Commit once all selected comments are resolved AND formatting passes:
    ```bash
    git add <files> && git commit -m "fix: address CodeRabbit review comments"
    git push
    ```

## 5) Unblock stale CHANGES_REQUESTED review

After fixes are pushed, a prior `CHANGES_REQUESTED` from a bot (CodeRabbit, etc.) may
still block merge even after all issues are resolved. Check and dismiss:

```bash
# Check current review decision
gh pr view <N> --repo <owner>/<repo> --json reviewDecision,mergeStateStatus

# If reviewDecision is still CHANGES_REQUESTED, find the review ID
gh api repos/<owner>/<repo>/pulls/<N>/reviews | python3 -c "
import json,sys
for r in json.load(sys.stdin):
    if r.get('state')=='CHANGES_REQUESTED':
        print('id:', r['id'], '| author:', r.get('user',{}).get('login'))
"

# Dismiss the stale review (safe when all issues genuinely addressed)
gh api -X PUT repos/<owner>/<repo>/pulls/<N>/reviews/<review_id>/dismissals \
  -f message="All raised issues addressed in follow-up commits."
```

Only dismiss when: (1) all code issues in the review are fixed, (2) fix commits are
pushed, (3) the reviewer is a bot rate-limited and unable to re-review.

## Notes

- `Test Autogen (Warn)` and other `(Warn)`-suffix checks are advisory — not required for merge.
- If `fetch_comments.py` fails (not in a git repo with an open PR), use the REST API fallback in step 1.
- After pushing, re-check `gh pr checks` to confirm all required checks still pass.
- Never bypass branch protection (no `gh pr merge --admin`, no `enforce_admins` toggle). If protection still blocks after all comments are resolved, surface it to the user.

## Outputs / Evidence

- Numbered comment list with severity and fix summary.
- Confirmation of which issues were already fixed vs. newly fixed.
- Git commit hash and push confirmation.

## Failure / Stop Conditions

- Stop if required credentials, environment access, or prerequisite context are missing.
- Stop if the workflow would report unverified work as complete.
- Do not bypass required gates or safeguards unless the user explicitly asks for it.

## Memory Hooks

- Read memory when product, repo, or workflow history affects correctness (e.g., prior CodeRabbit fix sessions).
- Write memory only if this work establishes a durable policy or convention.
