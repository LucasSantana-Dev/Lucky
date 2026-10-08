---
name: merge-confidently
description: 'Composite: readiness verdict, fix CI, address comments, then merge your own PR (or --no-merge for the verdict only). --open first opens the PR on main from a feature branch. Answers "can I merge this?" and "open PR and merge".'
triggers:
    - merge-confidently
    - can i merge
    - is this ready
    - merge this
    - ship this
    - ready to merge
    - pr merge check
    - open pr and merge
    - pr and merge
    - merge to main
    - ship this change
    - trunk workflow
user-invocable: true
auto-invoke: merge-requests + pr-completion-claims + "open PR and merge"
metadata:
    owner: global-agents
    tier: contextual
    canonical_source: /Users/lucassantana/.claude/skills/merge-confidently
---

# Merge Confidently

Daily-use composite. Turns "is this PR ready?" into one workflow that resolves
every blocker automatically and stops only when human input is required.

## Other-author PRs: halt (READ FIRST)

CLAUDE.md hard rule: _never automate any action on a PR with comments from
another person, or on any open PR authored by another person. Bots do not count.
Halt and tell the user._ Owner decision 2026-10-07: an APPROVED review from
another person with no body and no inline comments is not a comment; any other
human review or comment halts. Before any fixer, comment reply, push or merge,
run (classify by REST `user.type == "Bot"`, never by a name list):

```bash
ME=$(gh api user -q .login) || halt          # non-zero exit or empty: halt
gh pr view <N> --json author -q '.author.login,.author.is_bot'
gh api --paginate repos/{o}/{r}/issues/<N>/comments --jq '.[]|[.user.login,.user.type]|@tsv'
gh api --paginate repos/{o}/{r}/pulls/<N>/comments  --jq '.[]|[.user.login,.user.type]|@tsv'
gh api --paginate repos/{o}/{r}/pulls/<N>/reviews   --jq '.[]|[.user.login,.user.type,.state,(.body==""|tostring)]|@tsv'
gh pr view <N> --json commits -q '.commits[].authors[].login'
```

Halt and report (take no action, post no comment) if:

- the PR author is neither the current user nor a bot, or
- any non-bot login other than the current user has a conversation comment, an
  inline review comment, or a review whose state is not APPROVED or whose body is
  non-empty (this includes every human CHANGES_REQUESTED or COMMENTED review;
  never auto-run `gh-address-comments` on it), or
- a commit on the PR was authored or pushed by a login that is neither the
  current user nor a bot.

Re-check before each mutation; a new human comment mid-run halts the PR. Other
skills point here for the full rule.

## Auto-invocation triggers

- User says "merge this", "ship this", "is this ready"
- After commit-push-pr workflow completes with a new PR
- When a PR has been open >24h without action

## Workflow

### Modes

- default: Phases 1 to 6, ends with the merge. Merges an existing PR from any branch.
- `--open`: Phase 0 first (open the PR on `main` from a feature branch), then Phases 1
  to 6. Refuses to run on `main` or `master` itself (work happens on a feature branch);
  this refusal applies to `--open` only.
- `--open --no-merge`: Phase 0, then Phases 1 to 4 (open the PR, reach a verdict, no merge).
- `--no-merge`: Phases 1 to 4 only (verdict and fixes). Report the verdict and
  the head SHA seen; do not merge, arm auto-merge or clean up. Used by
  `ship-all-prs` per-PR units, which merge serially.

### Phase 0: Open the PR (`--open` only)

- Model check: trunk-based `main` is the default; the long-lived `release`-branch
  train was retired 2026-07-23. If `.claude/release-cadence-config.json` has
  `"model": "release-train"`, report "This repo opted into the retired release-train.
  `--open` targets `main` only; surface to the user before proceeding" and stop.
- Pre-flight: `git status --short`; there is something to commit OR a feature branch
  already exists locally; current branch is not `main`/`master`.
- Existing PR check (first step): `gh pr list --head <branch> --state open --json number`.
  If a PR exists, run the other-author halt check above on it and reuse that PR
  (skip `pr-flow`, do not open a second one). If none exists, continue below.
- Draft the PR body and validate its `Changelog` field BEFORE `pr-flow` creates the
  PR. The body includes what changed (1-3 lines), why (link the issue when
  applicable), and the `Changelog` field (see `standards/pr-conventions.md`): the
  literal line that will land under `[Unreleased]`. The body must quote that exact
  line as a preview in a "Changelog" section, e.g. `- feat(scope): summary (#<n>)`
  (the append below uses precisely that line). Refuse to proceed (no silent
  CHANGELOG entries) if the Changelog field is missing; release-please repos skip the
  field and the append below.
  In the reply, show the drafted PR body itself, with its "Changelog" section quoting
  that line.
- Invoke `pr-flow` with `--base main` (conventional commit subject required; the PR
  base MUST be `main`; the title uses the conventional prefix) using the validated body.
- Changelog line (skip in release-please repos: the conventional commit subject IS the
  entry): re-run the halt check, then invoke `changelog-update --append "<line>"`,
  one line under the existing `[Unreleased]` section with a conventional category
  (Added/Changed/Fixed/Removed/Security/Deprecated). Never promote `[Unreleased]` to
  a version. Commit as `docs(changelog): record <subject>`, push, wait for CI on that
  final commit. Stop if CHANGELOG already contains the exact line (duplicate work).
- `--open` never tags, bumps the version or deploys. Say so in the reply, and say the
  release is handled by release-please or a separate `/ship-it` run.
- Then continue with Phase 1. Wait up to 5 minutes for automated reviewers to enqueue
  (CodeRabbit, Greptile, SonarCloud, Sentry PR review, CI) before the first verdict.

### Phase 1: Combined verdict (always)

Invoke `pr-merge-readiness` for the 9-signal aggregate verdict.

Verdict drives the remaining phases:

- **MERGE** → skip to Phase 5
- **WAIT** → Phase 2 (resolve waits)
- **FIX** → Phase 3 (resolve blockers)

### Phase 2: Resolve waits (if WAIT)

For each WAIT signal:

- CI in progress → invoke `gh-fix-ci` (watch, required checks) until checks complete, then re-verdict
- Branch behind base → rebase or merge base in
- Awaiting review → notify reviewers, wait or page
- CodeRabbit/Greptile suggestions → invoke `gh-address-comments`

After resolution: re-invoke `pr-merge-readiness`. If still WAIT after 2 cycles,
surface to user — likely needs human decision.

### Phase 3: Resolve blockers (if FIX)

For each FAIL signal:

- CI failure → invoke `gh-fix-ci` in fix mode (own PR only, autonomous fix attempt)
- CHANGES_REQUESTED review from a bot only → invoke `gh-address-comments`; a human CHANGES_REQUESTED halts (see the halt section)
- Conflicts → rebase, resolve, push
- Branch protection block → surface to user; do not bypass

After fix: re-invoke `pr-merge-readiness`. Hard cap: 3 FIX cycles. Count cycles already run in this conversation or reported by the user. At the cap, do NOT run another cycle, even if the user asks for "one more": stop, say the 3-cycle limit is reached, list every remaining blocker (failing test names and files), note whether attempts are converging (same test still failing, new failures appearing), and recommend human diagnosis. The user may run further cycles themselves.

### Phase 4: Re-verify (if Phase 2 or 3 ran)

Re-invoke `pr-merge-readiness`. Continue when verdict is MERGE.

### Phase 5: Merge (always when MERGE; skipped with `--no-merge`)

Re-run the halt check, record the head SHA the MERGE verdict saw.

**Rollback gate** (before merging). It fires only when BOTH hold: (a) the merge
actually triggers a prod deploy (Vercel or Cloudflare git integration, or a deploy
workflow whose `on.push` branches include the base branch AND whose `paths:` filters
match the changed files), and (b) the diff touches runtime code or infra (Cloudflare,
homelab, Dockerfile, deploy workflows). When it fires, state the rollback plan and
require user confirmation; that confirmation makes the merge T3.

```
Rollback plan:
  Revert steps: [e.g. git revert <merge sha>, re-deploy previous tag]
  Commands: [exact commands]
  Estimated recovery time: [~X minutes]
```

If no rollback plan can be formulated, halt and ask the user. Docs, tests or CI-only
diffs: state the rollback plan, no confirmation needed, the merge stays T2. Also
exempt: feature-branch preview deploys, staging-only changes, hotfixes reverting a
prior bad deploy.

Then: `gh pr merge <N> --squash --delete-branch --match-head-commit <sha>`
(repo `.claude/release-config.json` `mergeMethod` overrides). Never `--admin`,
never `--no-verify`. A head mismatch means new commits arrived: re-verdict.
Confirm with `gh pr view <N> --json state,mergeCommit` (state MERGED, merge SHA
on `origin/main`). Tier: merging your own PR after a MERGE verdict is T2 (one
critic pass, then a log line to `~/.claude/autonomy-gates.jsonl` per CLAUDE.md);
another author's PR stays halted.
Tagging and deploy are separate: release-please, or `ship-it` after merge. This
composite never tags, bumps versions or deploys.

### Phase 6: Cleanup (always after merge)

- Delete the merged feature branch (local and remote, if not auto-deleted by GitHub) AND
  fast-forward local main: `git fetch origin && git switch main && git pull --ff-only`
  (skip if the user is on another branch with uncommitted changes)
- Invoke `commit-commands:clean_gone` if multiple stale local branches exist

## Reconciliation

Per-cycle status update, final summary:

```
MERGE CONFIDENTLY — PR #<n> "<title>"
  Opened:           PR #<n> main <- <branch>, [Unreleased] line added | skipped (release-please) (--open only)
  Initial verdict:  WAIT (CodeRabbit suggestions, CI in progress) <STATUS>
  Cycle 1:          gh-fix-ci → green; gh-address-comments → resolved <STATUS>
  Re-verdict:       MERGE <STATUS>
  Merged:           squash at <SHA> <STATUS>
  Cleanup:          branch deleted; 2 stale local branches pruned <STATUS>
  Snapshot:        <path to merge log | (none, task ongoing)>
  Open watch:      <future obligation | (none)>
```

## Outputs / Evidence

- Initial readiness verdict
- Per-cycle resolution log
- Merge SHA

## Failure / Stop Conditions

- After 3 fix cycles still FIX → stop (hard cap, no "one more" even if asked), escalate to user with full blocker list
- After 2 wait cycles still WAIT → stop, likely needs human decision (review,
  staffing, environment access)
- `--open` on a repo that opted into the retired release-train → report and stop
- `--open` PR body without a Changelog field (non-release-please repo) → refuse
- Never merge without `pr-merge-readiness` returning MERGE
- Never use `--admin` or `--no-verify` even if asked, that is a
  user-only override
