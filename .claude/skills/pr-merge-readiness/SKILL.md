---
name: pr-merge-readiness
description: Aggregate every PR merge signal (CI, reviews, conflicts, scans, bots) into one verdict, MERGE / WAIT / FIX. Use before merging. --batch [N...] gives a read-only verdict table for several PRs or all your open PRs.
user-invocable: true
argument-hint: '[<PR number or URL>] [--strict] [--batch [N...] [--quick] [--repo owner/name]]'
metadata:
    owner: global-agents
    tier: contextual
    canonical_source: /Users/lucassantana/.claude/skills/pr-merge-readiness
invocation_type: internal
triggers:
    - pr ready
    - merge check
    - is this pr ready
    - merge readiness
    - pr-snapshot
    - batch pr check
    - pr status table
---

# PR Merge Readiness

Replaces the manual checklist of "is CI green? are reviews approved? does it conflict?
did Sonar/CodeRabbit/Greptile finish? is the branch stale?" with a single skill that
collects every signal and outputs one verdict.

## Use When

- About to merge a PR and want one combined "ready / not ready" answer
- Reviewing many PRs in a batch and need a triage table
- Reviewing PRs from PR-Agent, CodeRabbit, or Greptile that already have third-party
  comments to reconcile

## Do Not Use When

- The PR is still WIP and you know it isn't done — use `merge-confidently` later
- Only one signal matters (e.g., just need CI status): use `gh-fix-ci` directly (report-only mode)
- The work is on a branch with no PR yet — use `pr-flow` to create one first

## Inputs / Prereqs

- `gh` CLI authenticated for the repo
- PR number, URL, or current branch (defaults to current branch's open PR)
- `--strict` flag: fail on any non-passing signal, even informational ones
- `--batch [N...] [--quick]` flag: batch mode (see "Batch mode" below)

## Batch mode (`--batch [N...] [--quick]`)

Verdict many PRs at once. Replaces the retired `pr-snapshot` skill. Batch verdicts are
identical to single-PR verdicts (same 9 signals, same thresholds, same verdict table,
`--strict` included, so `--strict` size rules apply too).

Targets:

- `--batch 645 646 647`: verdict each listed PR in the current repo (or `--repo owner/name`).
- `--batch` with no numbers, inside a git repo: all my open PRs there,
  `gh pr list --author @me --state open --json number --limit 50`.
- `--batch` with no numbers, outside a git repo and no `--repo`: never stop to ask. Run
  `gh search prs --author=@me --state=open --json repository,number,title,url`, group
  by repository, and run one batched query per repo.

Procedure:

1. Collect PR numbers (and repos). Zero PRs: print "No open PRs" and stop.
2. Per repo, fetch every signal in ONE `gh api graphql` call (one alias per PR number).
   Per PR request: title, state, isDraft, mergeable, mergeStateStatus, reviewDecision,
   `reviewRequests`, additions, deletions, changedFiles, createdAt, updatedAt, author,
   `baseRefName`, `headRefName`, `statusCheckRollup` (CI, plus the Sonar and Socket
   check names), `comments(last:50){ author{login} body }` (CodeRabbit, Greptile),
   `closingIssuesReferences(first:5){ nodes{ number state closedAt } }`, and staleness
   via `baseRef{ compare(headRef: "<head>"){ behindBy } }`. If the GraphQL `compare`
   field is unavailable, use `gh api repos/{o}/{r}/compare/{base}...{head}` (`behind_by`)
   and say so in the output. Never use local `git rev-list` in batch mode, and never
   loop `gh pr view` per PR. An unavailable staleness value is WARN, not PASS.
3. Evaluate all 9 signals per PR with the single-PR rules. Non-OPEN PRs (MERGED/CLOSED)
   get no verdict: show State and sort them last.
4. Print one compact table, one row per PR:

```
#PR  Title (max 50 chars)       State   CI       Age  Verdict  Blocking signal        Next action
---  -------------------------  ------  -------  ---  -------  ---------------------  --------------------------
645  Add auth refresh flow              pass     1d   MERGE    none                   gh pr merge 645 --squash
646  Fix cache invalidation             pending  2d   WAIT     CI running             re-run when checks finish
647  Bump dependencies                  fail     5d   FIX      CI: ci / test failing  /gh-fix-ci
650  Old experiment             CLOSED  pass     40d  none     closed                 none
```

State is blank when OPEN. CI is pass, pending or fail from the rollup. Age is days
since updatedAt. Order: open rows MERGE, then WAIT, then FIX, then PR number; non-OPEN
rows last. Blocking signal is the first FAIL (else first WARN), named concretely.
Unknown or unfetchable signals count as WARN, never PASS. Add one totals line, e.g.
`1 MERGE, 1 WAIT, 1 FIX`. For one PR's full signal list, re-run without `--batch`. 5. Next action. For a PR authored by someone else, or my PR that has comments from a
human (non-bot) reviewer, write `halt: tell user` and never a merge command. 6. Not found or errors. A PR number that resolves to nothing gets a "not found" row;
retry the query without it instead of failing the batch. On rate-limit or network
errors mark the affected rows WAIT ("could not check"); never invent a verdict.

`--quick`: base signals only (state, CI rollup, review decision, mergeable, age). Used by
`session-bootstrap`. Verdicts in quick mode are provisional: skip signals 5 to 9, and
label the verdict column `Verdict*` with a footnote that third-party, size, staleness and
card signals were not evaluated. Unknown stays WARN.

Batch hard rules (inline, not negotiable):

- Read-only. Never merge, rebase, comment, label, approve or push, even for a MERGE row.
  The next-action column is a suggestion only.
- One batched query for all signals (per repo), not a per-PR loop.
- PRs authored by someone else may be listed but are never acted on.

---

## Workflow

### 1. Identify the PR

```bash
# Default to current branch's PR
PR=$(gh pr view --json number -q .number 2>/dev/null)
[ -z "$PR" ] && { echo "No open PR for current branch"; exit 1; }

# Or use explicit arg
[ -n "$1" ] && PR="$1"

gh pr view "$PR" --json title,headRefName,baseRefName,mergeable,mergeStateStatus,\
isDraft,reviewDecision,statusCheckRollup,labels,additions,deletions,changedFiles,\
updatedAt,author,url
```

### 2. Collect signals

Run all checks in parallel where possible. Each produces a status: `PASS`, `WARN`, `FAIL`,
or `SKIP` (signal not applicable to this repo).

#### Signal 1: Draft state

```bash
gh pr view "$PR" --json isDraft -q .isDraft
```

Draft → `FAIL` (cannot merge a draft).

#### Signal 2: Mergeability and conflicts

```bash
gh pr view "$PR" --json mergeable,mergeStateStatus
```

`mergeable: CONFLICTING` → `FAIL` with the list of conflicting files.
`mergeStateStatus: BLOCKED` → `FAIL` (required reviews missing or branch protection).
`mergeStateStatus: BEHIND` → `WARN` (rebase/merge main needed).
`mergeStateStatus: CLEAN` → `PASS`.

#### Signal 3: CI status

```bash
gh pr checks "$PR" --json name,state,conclusion,detailsUrl
```

Any `FAILURE` → `FAIL` with the failing check names.
Any `IN_PROGRESS`/`PENDING` → `WARN` ("CI still running").
All `SUCCESS` → `PASS`.

For known-flaky-but-not-blocking checks, classify as `WARN` not `FAIL` (configurable
per-repo via `.claude/pr-checks-allow-flaky.txt` if present).

#### Signal 4: Review decision

```bash
gh pr view "$PR" --json reviewDecision,reviewRequests
```

`APPROVED` → `PASS`.
`CHANGES_REQUESTED` → `FAIL` with reviewer names.
`REVIEW_REQUIRED` → `WARN` ("awaiting review from X").
No required reviewers → `SKIP`.

#### Signal 5: Branch staleness

```bash
gh pr view "$PR" --json baseRefName,headRefName
git fetch origin --quiet
BEHIND=$(git rev-list --count "origin/$(gh pr view "$PR" --json headRefName -q .headRefName)..origin/$(gh pr view "$PR" --json baseRefName -q .baseRefName)" 2>/dev/null)
```

Branch >50 commits behind base → `WARN` ("rebase recommended").
Branch >200 commits behind → `FAIL` ("rebase required, very stale").

#### Signal 6: Third-party reviewer comments

Detect which third-party reviewers exist on the repo and check each:

```bash
# All review comments
gh pr view "$PR" --json comments -q '.comments[] | {author: .author.login, body: .body[0:200]}'

# CodeRabbit
gh pr view "$PR" --json comments -q '.comments[] | select(.author.login == "coderabbitai") | .body' | head -20

# Greptile
gh pr view "$PR" --json comments -q '.comments[] | select(.author.login | startswith("greptile")) | .body' | head -20

# Sonar (status check, not comment)
gh pr checks "$PR" --json name,state,conclusion -q '.[] | select(.name | test("Sonar"; "i"))'

# Socket
gh pr checks "$PR" --json name,state,conclusion -q '.[] | select(.name | test("Socket"; "i"))'
```

For each found reviewer:

- Unaddressed `🛑` / "must fix" / "blocking" comments → `FAIL`
- Unaddressed suggestions / nits → `WARN`
- All resolved or only positive comments → `PASS`
- Reviewer not present on this repo → `SKIP`

#### Signal 7: PR size

```bash
gh pr view "$PR" --json additions,deletions,changedFiles
```

- <300 LOC, <10 files → `PASS`
- 300–1000 LOC or 10–25 files → `WARN` ("large — verify scope")
- > 1000 LOC or >25 files → `FAIL` in `--strict` mode, `WARN` otherwise

#### Signal 8: Branch age

```bash
gh pr view "$PR" --json createdAt,updatedAt
```

Last update >7 days ago → `WARN` ("stale; rebase + re-verify before merge").

#### Signal 9: Card/issue fidelity

"Does this PR know which card it closes, and is that card's state still consistent with
what's actually being merged?" — added 2026-07-25 (Phase 3, card/prototype-fidelity debate).
Catches the same class of drift as Criativaria's board-hygiene bug: a card claims one state,
the repo says another.

```bash
gh pr view "$PR" --json body,closingIssuesReferences -q '{body: .body, linked: [.closingIssuesReferences[]?.number]}'
```

- No `closingIssuesReferences` AND PR body has no `Closes #`/`Fixes #`/`Resolves #` pattern
  → `SKIP` ("no linked card — untracked PRs are a normal pattern on this developer's repos,
  not a defect; don't WARN small/solo/dep-bump/typo PRs that never had a card to begin with")
- Linked issue found but already `CLOSED` independent of this PR (check
  `gh issue view <N> --json state,closedAt` — closed before this PR's `mergeStateStatus`
  went clean) → `WARN` ("linked issue #N already closed by something else — verify this PR
  still matches its current state before merging, board-hygiene drift risk")
- Linked issue found and `OPEN` → `PASS`
- Repo doesn't use issues for this workflow (no issues enabled) → `SKIP`

This signal only checks PR-to-card _linkage and state consistency_ — it does not check
whether the diff matches the card's described scope (over/under-building). That's
`overengineering-auditor`'s job (its `abstraction`/`generalization` categories cover
over-scoped commits); route there for scope-content review, not here.

---

### 3. Compute verdict

Aggregate the signals:

| Condition            | Verdict                                                        |
| -------------------- | -------------------------------------------------------------- |
| Any `FAIL`           | **FIX** — list the failing signals; do not merge               |
| Any `WARN` (no FAIL) | **WAIT** — list warnings; merge possible but explain why first |
| All `PASS` or `SKIP` | **MERGE** — ready                                              |

In `--strict` mode, any `WARN` becomes `FAIL`.

### 4. Output the report

```
PR #1234 — <title>
Branch: feature/x → main  |  Author: @lucas  |  Updated: 2h ago

SIGNALS
  ✓ Not draft
  ✓ Mergeable (clean)
  ✓ CI: 12/12 checks passing
  ✓ Reviews: APPROVED by @reviewer
  ✓ Branch: 3 commits behind base
  ⚠ CodeRabbit: 2 unresolved suggestions
  ✓ PR size: 287 LOC, 8 files
  ✓ Branch age: updated 2h ago
  ✓ Card fidelity: linked issue #42 (open)

VERDICT: WAIT
Reason: CodeRabbit has 2 unresolved suggestions. Resolve or explicitly dismiss
before merging. Run `/gh-address-comments` to handle them.

Suggested next action:
  /gh-address-comments  (then re-run this skill)
```

For `MERGE`:

```
VERDICT: MERGE
Suggested next action:
  gh pr merge 1234 --squash --delete-branch
```

For `FIX`:

```
VERDICT: FIX
Reason: CI check "test (backend)" is failing. Fix the failing test before merging.

Suggested next action:
  /gh-fix-ci  (or open the failing run: <detailsUrl>)
```

---

## Outputs / Evidence

- One-page verdict (MERGE / WAIT / FIX)
- Per-signal status with actionable detail
- Suggested next skill or `gh` command to advance
- Does not actually merge — that remains an explicit user action

## Failure / Stop Conditions

- `gh` not authenticated → report and stop
- Repo not found / PR number invalid → report and stop
- Network failure on any signal → mark that signal as `WARN` ("could not check") and
  continue; never silently treat unknown as PASS

## Memory Hooks

- Read memory for any per-repo overrides (allow-flaky checks, third-party reviewer
  expectations) before computing the verdict
- Optional: write a one-line memory after a MERGE verdict was acted on, so trend data
  ("Lucky merged 12 PRs this week, 3 with WARN overridden") becomes available
