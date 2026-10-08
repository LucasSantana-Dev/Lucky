# Output Patterns

## MERGE verdict

All signals passing or skipped. No action needed.

```
PR #1234 — Fix: update checkout retry logic
Branch: fix/checkout-retry → main  |  Author: @lucas  |  Updated: 2h ago

SIGNALS
  ✓ Not draft
  ✓ Mergeable (clean)
  ✓ CI: 12/12 checks passing
  ✓ Reviews: APPROVED by @reviewer
  ✓ Branch: 3 commits behind base
  ✓ CodeRabbit: no unresolved comments
  ✓ PR size: 287 LOC, 8 files
  ✓ Branch age: updated 2h ago

VERDICT: MERGE

Suggested next action:
  gh pr merge 1234 --squash --delete-branch
```

---

## WAIT verdict

Warnings present but no failures. Merge is possible; warnings should be understood first.

```
PR #1234 — Add payment webhook handler
Branch: feat/payment-webhook → main  |  Author: @lucas  |  Updated: 6h ago

SIGNALS
  ✓ Not draft
  ✓ Mergeable (clean)
  ✓ CI: 12/12 checks passing
  ✓ Reviews: APPROVED by @reviewer
  ⚠ Branch: 75 commits behind base (rebase recommended)
  ⚠ CodeRabbit: 2 unresolved suggestions
  ✓ PR size: 412 LOC, 12 files
  ⚠ Branch age: last update 6h ago

VERDICT: WAIT

Reason:
  1. CodeRabbit has 2 unresolved suggestions — address or dismiss before merging.
  2. Branch 75 commits behind base — rebase recommended before final merge.

Suggested next actions:
  /gh-address-comments  (review third-party feedback)
  git rebase main  (update branch)
  Then re-run this skill to confirm.
```

---

## FIX verdict

One or more failures. Do not merge. Surface blockers and suggest corrective actions.

```
PR #1234 — Enable experimental caching layer
Branch: feat/cache-layer → main  |  Author: @lucas  |  Updated: 2d ago

SIGNALS
  ✓ Not draft
  ✗ Mergeable: CONFLICTING
    - Conflict in src/cache.ts
    - Conflict in src/index.ts
  ✗ CI: 2/12 checks failing
    - test-backend (failed 3 times) → https://...
    - lint-style (failed) → https://...
  ✓ Reviews: APPROVED by @reviewer
  ✓ Branch: 3 commits behind base
  ✓ CodeRabbit: no unresolved comments
  ⚠ PR size: 1247 LOC, 28 files (large)
  ✓ Branch age: updated 2h ago

VERDICT: FIX

Blockers (required):
  1. Merge conflicts in src/cache.ts and src/index.ts — resolve conflicts, commit, push
  2. CI failing on test-backend (3 failures) and lint-style — fix tests/lint, push

Warnings (address before merge):
  1. PR is very large (1247 LOC, 28 files) — verify scope is intentional

Suggested next actions:
  /gh-fix-ci  (troubleshoot + fix failing checks)
  Then resolve conflicts:
    git rebase main
    (resolve + git add .)
    git rebase --continue
  Then re-run this skill to confirm.
```

---

## Network failure (transient)

If any signal cannot be queried due to network failure, mark that signal as `WARN` ("could not check — connectivity issue") and continue. Never silently treat unknown as PASS.

```
PR #1234 — Update API schema validation
Branch: feat/schema-validation → main  |  Author: @lucas  |  Updated: 1h ago

SIGNALS
  ✓ Not draft
  ✓ Mergeable (clean)
  ⚠ CI: could not fetch checks (network error) — will retry
  ✓ Reviews: APPROVED by @reviewer
  ✓ Branch: 0 commits behind base
  ✓ CodeRabbit: no unresolved comments
  ✓ PR size: 156 LOC, 4 files
  ✓ Branch age: updated 1h ago

VERDICT: WAIT

Reason: CI status could not be determined due to network error. Wait for CI to complete,
then re-run this skill to confirm all checks pass.

Suggested next action:
  gh-fix-ci 1234 report-only  (watch required checks, no edits)
  Then re-run this skill.
```
