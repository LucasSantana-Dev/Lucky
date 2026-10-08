# PR Merge-Readiness Signals Catalog

Each signal produces a status: `PASS`, `WARN`, `FAIL`, or `SKIP` (signal not applicable).

## Signal 1: Draft state

```bash
gh pr view "$PR" --json isDraft -q .isDraft
```

- Draft → `FAIL` (cannot merge a draft)
- Published → `PASS`

---

## Signal 2: Mergeability and conflicts

```bash
gh pr view "$PR" --json mergeable,mergeStateStatus
```

| State         | Status | Action                                                      |
| ------------- | ------ | ----------------------------------------------------------- |
| `CONFLICTING` | `FAIL` | List conflicting files; require manual resolution           |
| `BLOCKED`     | `FAIL` | Required reviews missing or branch protection rule violated |
| `BEHIND`      | `WARN` | Rebase/merge needed against base branch                     |
| `CLEAN`       | `PASS` | Ready to merge                                              |

---

## Signal 3: CI status

```bash
gh pr checks "$PR" --json name,state,conclusion,detailsUrl
```

| State                       | Status                                            |
| --------------------------- | ------------------------------------------------- |
| Any `FAILURE`               | `FAIL` — list failing check names and details URL |
| Any `IN_PROGRESS`/`PENDING` | `WARN` ("CI still running")                       |
| All `SUCCESS`               | `PASS`                                            |

**Flaky-check allowlist:**
For known-flaky-but-not-blocking checks, classify as `WARN` not `FAIL` if
`.claude/pr-checks-allow-flaky.txt` exists and lists the check name (one per line).

---

## Signal 4: Review decision

```bash
gh pr view "$PR" --json reviewDecision,reviewRequests
```

| Decision              | Status                                                      |
| --------------------- | ----------------------------------------------------------- |
| `APPROVED`            | `PASS`                                                      |
| `CHANGES_REQUESTED`   | `FAIL` — list reviewer names + summary of requested changes |
| `REVIEW_REQUIRED`     | `WARN` — list reviewers awaiting response                   |
| No required reviewers | `SKIP`                                                      |

---

## Signal 5: Branch staleness (commits behind base)

```bash
git fetch origin --quiet
BEHIND=$(git rev-list --count \
  "origin/$(gh pr view "$PR" --json headRefName -q .headRefName)..origin/$(gh pr view "$PR" --json baseRefName -q .baseRefName)" 2>/dev/null)
```

| Commits behind | Status                                 |
| -------------- | -------------------------------------- |
| >200           | `FAIL` — "very stale; rebase required" |
| >50            | `WARN` — "rebase recommended"          |
| ≤50            | `PASS`                                 |

---

## Signal 6: Third-party reviewer comments

Detect code-quality bots (CodeRabbit, Greptile, Sonar, Socket) and classify by feedback type:

```bash
# CodeRabbit
gh pr view "$PR" --json comments -q '.comments[] | select(.author.login == "coderabbitai") | .body'

# Greptile
gh pr view "$PR" --json comments -q '.comments[] | select(.author.login | startswith("greptile")) | .body'

# Sonar / Socket (status checks, not comments)
gh pr checks "$PR" --json name,state,conclusion -q '.[] | select(.name | test("Sonar|Socket"; "i"))'
```

For each reviewer found:

| Feedback type                                       | Status |
| --------------------------------------------------- | ------ |
| Unaddressed `🛑` / "must fix" / "blocking" comments | `FAIL` |
| Unaddressed suggestions / nits                      | `WARN` |
| All resolved or only positive comments              | `PASS` |
| Reviewer not present on this repo                   | `SKIP` |

---

## Signal 7: PR size

```bash
gh pr view "$PR" --json additions,deletions,changedFiles
```

| Lines of code | Files | --strict=false                  | --strict=true |
| ------------- | ----- | ------------------------------- | ------------- |
| <300 LOC      | <10   | `PASS`                          | `PASS`        |
| 300–1000 LOC  | 10–25 | `WARN` ("large — verify scope") | `FAIL`        |
| >1000 LOC     | >25   | `WARN`                          | `FAIL`        |

---

## Signal 8: Branch age (last update)

```bash
gh pr view "$PR" --json updatedAt
```

| Age                       | Status                                            |
| ------------------------- | ------------------------------------------------- |
| >7 days since last update | `WARN` ("stale; rebase + re-verify before merge") |
| ≤7 days                   | `PASS`                                            |

---

## Verdict rules

| Condition            | Verdict   | Action                                                     |
| -------------------- | --------- | ---------------------------------------------------------- |
| Any `FAIL`           | **FIX**   | List failures; do not merge; suggest next skill to fix     |
| Any `WARN` (no FAIL) | **WAIT**  | List warnings; merge possible but explain trade-offs first |
| All `PASS` or `SKIP` | **MERGE** | Ready to merge now                                         |

**Strict mode** (`--strict`): any `WARN` treated as `FAIL` → verdict becomes **FIX**.
