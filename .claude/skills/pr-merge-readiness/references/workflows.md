# Workflow Details

## Identify the PR

Default to current branch's open PR; allow explicit PR number or URL.

```bash
PR=$(gh pr view --json number -q .number 2>/dev/null)
[ -z "$PR" ] && { echo "No open PR for current branch"; exit 1; }

# Or use explicit arg
[ -n "$1" ] && PR="$1"

# Fetch PR metadata once
gh pr view "$PR" --json \
  title,headRefName,baseRefName,mergeable,mergeStateStatus,\
  isDraft,reviewDecision,statusCheckRollup,labels,additions,deletions,\
  changedFiles,updatedAt,author,url
```

Done when: PR number identified and metadata fetched.

---

## Collect signals (parallel)

Run all 8 signal checks in parallel where possible (network I/O waits). Each
produces a status: `PASS`, `WARN`, `FAIL`, or `SKIP`.

See `signals-catalog.md` for detailed command syntax and verdict rules.

Done when: all 8 signals have a status + reasoning.

---

## Compute verdict

Aggregate signal statuses per the rules in `signals-catalog.md`:

- Any `FAIL` → **FIX**
- Any `WARN` (no FAIL) → **WAIT**
- All `PASS` or `SKIP` → **MERGE**

In `--strict` mode, any `WARN` becomes a `FAIL`.

Done when: single verdict determined.

---

## Output report

Signal-first: verdict + top-3 findings inline; bulk in the reference file.

See `output-patterns.md` for full examples (MERGE, WAIT, FIX, network-failure cases).

Done when: user sees verdict + suggested next action + can act immediately.
