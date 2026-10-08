# Dismiss Stale Bot Reviews

After all code issues are resolved and fixes are pushed, a bot's `CHANGES_REQUESTED`
may still block merge. Dismiss only when safe.

## Check review state

```bash
gh pr view --json reviewDecision,mergeStateStatus
```

If `reviewDecision: CHANGES_REQUESTED`, find the bot's review ID:

```bash
OWNER=$(gh repo view --json owner -q .owner.login)
REPO=$(gh repo view --json name -q .name)
PR=$(gh pr view --json number -q .number)

gh api repos/$OWNER/$REPO/pulls/$PR/reviews | jq -r '.[] | select(.state == "CHANGES_REQUESTED") | "\(.id): \(.user.login)"'
```

## Dismiss (only when all issues fixed + pushed)

```bash
gh api -X PUT repos/$OWNER/$REPO/pulls/$PR/reviews/<review_id>/dismissals \
  -f message="All raised issues addressed in follow-up commits."
```

**Only dismiss when:**

1. All code issues in the review are genuinely fixed.
2. Fix commits are pushed and CI is running.
3. The reviewer is a bot (CodeRabbit, Sonar, etc.), not a human.

Human reviews must be re-reviewed by the human — never dismiss unilaterally.
