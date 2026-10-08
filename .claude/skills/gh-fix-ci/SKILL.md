---
name: gh-fix-ci
description: 'Diagnose red, flaky or blocked PR checks: isolate the first real blocker from noise, read Actions logs, and fix failing checks on your own PR branch. Handles Buildkite and SonarCloud by reporting. Use when CI is red before merge.'
triggers:
    - fix ci
    - github actions
    - failing checks
    - ci failure
    - debug ci
    - ci watch
    - check the pipeline
    - ci red
    - flaky checks
    - pr blocked
metadata:
    owner: global-agents
    tier: contextual
    canonical_source: /Users/lucassantana/.agents/skills/gh-fix-ci
---

# gh-fix-ci

## Overview

Single skill for red, flaky or blocked PR checks. Use gh to read the PR state, separate required
failures from advisory noise, isolate the first real blocker, fetch GitHub Actions logs, then fix
it when the PR is the user's own.

## Hard rules

- Halt on any PR authored by another person, or carrying another person's comments or reviews.
  Bots (CodeQL, CodeRabbit, Greptile, github-advanced-security) do not count. Report what blocks
  it and tell the user; no fix, push or comment.
- Never force-merge through red or UNKNOWN CI.
- Never disable branch protection (no `enforce_admins` toggle, no ruleset edits). `BLOCKED` from
  review or protection: surface it, do not work around it.
- This skill never merges. Pending is not green: never report PASS while a required check is
  pending.

## Autonomy

- Fixing CI on the user's own PR branch (formatter run, lockfile, test or config fix, small
  commit and push to that branch) is T1: proceed and report. No approval step, no plan skill.
- Rebase plus `git push --force-with-lease` to the user's OWN PR branch is T1. Any shared branch
  (main, release, a branch others push to) is T3: ask.
- Merging your own PR after a MERGE verdict is T2 (critic pass plus gates log line; see `merge-confidently`).
- T3, ask the user: merges into main of another author's PR (halted above), protection or ruleset
  changes, production or deploy workflows, secrets or credentials, destructive actions such as
  close and recreate PR or force-push of shared history.
- Read-only diagnosis (Watch, triage and report, steps 1 to 6) is T0: proceed silently.

## Modes

- **Fix mode** (default, own PR only): watch, triage, then fix and push (step 8).
- **Report-only mode**: watch and triage, print the report, then stop. No edits, no commits, no
  pushes, no `update-branch`, no thread resolution. Callers that are read-only (gates, watchers,
  post-deploy checks) must say "report-only" explicitly when invoking. Also use it for any PR you
  are not allowed to fix.
- **Commit/branch mode** (no PR, for post-deploy checks): replace the PR with a ref.
  `gh run list --commit <sha> --json databaseId,workflowName,status,conclusion,url` or
  `gh run list --branch main --limit 10 --json databaseId,workflowName,status,conclusion,headSha,url`.
  Same Watch and report rules apply (`status != completed` is PENDING). Failed run: triage with
  `gh run view <id> --log-failed`. Always report-only.

Prereq: authenticate with the standard GitHub CLI once (for example, run `gh auth login`), then confirm with `gh auth status` (repo + workflow scopes are typically required).

## Inputs

- `repo`: path inside the repo (default `.`)
- `pr`: PR number or URL (optional; defaults to current branch PR)
- `gh` authentication for the repo host

## Quick start

- `python "<path-to-skill>/scripts/inspect_pr_checks.py" --repo "." --pr "<number-or-url>"`
- Add `--json` if you want machine-friendly output for summarization.

## Workflow

1. Verify gh authentication.
    - Run `gh auth status` in the repo.
    - If unauthenticated, ask the user to run `gh auth login` (ensuring repo + workflow scopes) before proceeding.
2. Resolve the PR and check authorship.
    - Prefer the current branch PR: `gh pr view --json number,url`.
    - If the user provides a PR number or URL, use that directly.
    - Read author, reviews and comments (`gh pr view --json author,reviews,comments`). Other author or a human comment: stop per Hard rules.
3. Watch (required checks only).
    - `gh pr checks <pr> --required --json name,bucket,state`. If any bucket is `pending`, arm a
      `Monitor` until-loop (see "Watch loop" below) and wait until none are pending, then continue.
    - The verdict is PASS (all required pass), FAIL (any required fail), or PENDING (any required
      still pending, including after the watch times out). PENDING is not green. The bundled
      script exits 0 clean, 1 failing, 2 pending: pending is never "no failing checks, so green".
4. Inspect failing checks (GitHub Actions only).
    - Preferred: run the bundled script (handles gh field drift and job-log fallbacks):
        - `python "<path-to-skill>/scripts/inspect_pr_checks.py" --repo "." --pr "<number-or-url>"`
        - Add `--json` for machine-friendly output.
    - Manual fallback:
        - `gh pr checks <pr> --json name,state,bucket,link,startedAt,completedAt,workflow`
            - If a field is rejected, rerun with the available fields reported by `gh`.
        - For each failing check, extract the run id from `detailsUrl` and run:
            - `gh run view <run_id> --json name,workflowName,conclusion,status,url,event,headBranch,headSha`
            - `gh run view <run_id> --log`
        - If the run log says it is still in progress, fetch job logs directly:
            - `gh api "/repos/<owner>/<repo>/actions/jobs/<job_id>/logs" > "<path>"`
5. Scope non-GitHub Actions checks.
    - If `detailsUrl` is not a GitHub Actions run, label it as external and report the URL.
    - For SonarCloud, also capture public API evidence when it is readily available,
      for example quality-gate or hotspot status for the PR, but do not treat it as a
      GitHub Actions log source.
    - Do not attempt Buildkite or other providers beyond lightweight evidence capture;
      keep the workflow lean.
6. Triage and summarize for the user. Separate required checks (branch protection contexts)
   from advisory ones (CodeQL, Sonar, optional jobs) first. Isolate the first real failing job:
   downstream jobs that are only skipped or cancelled because of it are not independent failures,
   and the first bad log line outranks a trailing generic `exit code 1`. Return:
    - failing job (and run URL, if any)
    - first bad signal (quoted log snippet)
    - likely cause
    - likely owner surface
    - smallest viable fix
    - whether it blocks shipping now
      Call out missing logs explicitly.
7. First-red lookup (optional, for "when did it start"): `gh run list --workflow <w> --branch main --json conclusion,headSha,createdAt`; the oldest consecutive red run before the latest green one marks the first failure.
8. Fix (own PR branch only, fix mode only; see Autonomy). Right before any push, re-read
   `gh pr view --json author,comments,reviews`: author must be the user and no other person may
   have commented since step 2, else halt. Apply the smallest fix, using tools rather than hand
   edits where one exists (formatter, lockfile regen). If the failure is unrelated to the PR,
   say so with the evidence instead of patching around it.
9. Recheck. Re-run the relevant local tests, push, and confirm with `gh pr checks`. Report diffs,
   tests and the final check state.

## PR state machine

Read `gh pr view N --json state,mergeable,mergeStateStatus,reviewDecision` first, before deciding
anything from an UNKNOWN or BLOCKED label. Then:

| mergeable / state        | Action                                                                                                                                                                                                      |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MERGEABLE` + `CLEAN`    | proceed to merge (merging itself is a T2 call for your own PR, not part of this skill)                                                                                                                      |
| `MERGEABLE` + `UNSTABLE` | non-required check failing or pending; poll required-only checks                                                                                                                                            |
| `MERGEABLE` + `BEHIND`   | `gh pr update-branch`, or local rebase plus `git push --force-with-lease` to the user's OWN PR branch (T1). Any shared branch: T3, ask                                                                      |
| `MERGEABLE` + `BLOCKED`  | check `reviewDecision` and branch protection (`requiredStatusChecks`, `requiredApprovingReviewCount`, conversation resolution). Review or protection block: surface it to the user, never toggle protection |
| `CONFLICTING` + `DIRTY`  | local rebase first; if `git merge-tree` reports clean but GH disagrees it is webhook desync: tell the user, close and recreate the PR is a T3 ask                                                           |
| `UNKNOWN` + `UNKNOWN`    | GitHub still computing: wait 15s, recheck once. If still UNKNOWN, check `state`; it is often already `MERGED`, then stop, nothing to do                                                                     |

## Watch loop

For required checks that take more than 1 minute to settle, use the `Monitor` tool with an
until-loop on required checks only. Do not issue a single long `sleep`; the harness blocks
chained sleeps.

```
Monitor command: until [ "$(gh pr checks N --required --json bucket --jq '[.[] | select(.bucket=="pending")] | length')" = "0" ]; do sleep 15; done; gh pr checks N --required --json name,bucket
```

Commit/branch mode equivalent:

```
until [ "$(gh run list --commit SHA --json status --jq '[.[] | select(.status!="completed")] | length')" = "0" ]; do sleep 15; done; gh run list --commit SHA --json workflowName,conclusion,url
```

If `gh pr checks --required` exits 1 with "no required checks reported", the branch has no
required checks: fall back to all checks and say so.

## Gotchas

- `UNKNOWN` often means the PR was already merged in another window. Verify with
  `gh pr view N --json state` before re-arming a monitor; if `MERGED`, do not watch it.
- `mergeStateStatus: BLOCKED` with no failing checks means review or branch protection. Look at
  `requiredStatusChecks` and `requiredApprovingReviewCount`.
- `BLOCKED` with all checks green and only bot review threads (CodeQL, CodeRabbit, Greptile) open
  is an unresolved-conversation block. Bots are not "another person": resolve them with the
  `resolveReviewThread` GraphQL mutation, then re-read state. Any open human thread: halt.
- A PR head SHA that disagrees with `git ls-remote` for its branch ref is webhook desync; do not
  try to nudge it, report it.
- Workflow-level `paths` filters can leave a required check pending forever (never triggered is
  not the same as skipped). See `ci-cd/references/required-checks.md`.

## Bundled Resources

### scripts/inspect_pr_checks.py

Fetch failing PR checks, pull GitHub Actions logs, and extract a failure snippet. Exit codes: 0 clean, 1 failing checks, 2 no failures but checks still pending (not green). Add `--required` to consider required checks only.

Usage examples:

- `python "<path-to-skill>/scripts/inspect_pr_checks.py" --repo "." --pr "123"`
- `python "<path-to-skill>/scripts/inspect_pr_checks.py" --repo "." --pr "https://github.com/org/repo/pull/123" --json`
- `python "<path-to-skill>/scripts/inspect_pr_checks.py" --repo "." --max-lines 200 --context 40`

## Common CI Failure Patterns

### Formatter failures (Prettier / ruff)

**Symptom**: "X files would be reformatted" or "Code style issues found in N files"
**Fix**: Run the formatter directly, do NOT manually reformat:

```bash
npx prettier --write <files>   # JS/TS projects
ruff format <files>             # Python projects
```

Then commit and push. Never edit formatting by hand.

### CodeQL / GitHub Advanced Security false positives

**Symptom**: "File data in outbound network request" or "Network data written to file" on utility scripts that intentionally fetch config from APIs or write status reports.
**Distinguish**: Check whether the flagged code is:

- (a) Reading local config files (package.json, server.json) to construct registry lookup URLs → expected, not a real vulnerability
- (b) Writing CLI-provided output paths with fetched data → expected for status/report scripts

**Fix**: Add suppression comments at the specific flagged lines:

```js
// codeql[js/request-forgery] intentional: url built from local manifest, not user-controlled data.
const response = await fetch(url, ...);

// codeql[js/path-injection] intentional: outputDir is a trusted CLI arg, not user HTTP input.
writeFileSync(path.join(outputDir, 'report.json'), ...);
```

For Python:

```python
result = subprocess.run(cmd, ...)  # noqa: S603  # trusted, not user-supplied
```

**Do NOT suppress** when the flagged code actually processes untrusted user input (form data, query strings, request bodies) from an HTTP endpoint.

### Tag-to-version drift in release workflows

**Symptom**: A tag `v1.2.3` was pushed but `package.json` still says `1.2.2`, causing publish mismatch.
**Prevention**: Add a version gate step in the CI `validate` job:

```yaml
- name: Verify tag matches package version
  if: startsWith(github.ref, 'refs/tags/v')
  run: |
      TAG_VERSION="${GITHUB_REF_NAME#v}"
      PKG_VERSION="$(node -p "require('./package.json').version")"
      [ "$TAG_VERSION" = "$PKG_VERSION" ] || { echo "Tag/package version mismatch"; exit 1; }
```

## Outputs / Evidence

- Return the checks run, evidence captured, blockers found, and the next required action.

## Failure / Stop Conditions

- Stop if required credentials, environment access, or prerequisite context are missing.
- Stop if the workflow would report unverified work as complete.
- Do not bypass required gates or safeguards.

## Memory Hooks

- Read memory when product, repo, or workflow history affects correctness.
- Write memory only if this work establishes a durable policy or convention.
