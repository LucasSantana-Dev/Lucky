# Stale remote branches: archive the unrecoverable ones as tags, then delete

- **Date:** 2026-11-13
- **Status:** Accepted
- **Deciders:** Lucas Santana
- **Scope:** remote branches on `LucasSantana-Dev/Lucky` that have no open PR and are not
  `archive/*`

## Context

After merged branches were cleaned up on 2026-11-13, 69 remote branches remained besides
`main`: 5 with open PRs (Dependabot, release-please), 5 `archive/*` release snapshots, and 59
that are not merged. `delete_branch_on_merge` is on and only squash merges are allowed, so
these 59 are left over from closed PRs, branches that never had a PR, and PRs merged before
auto-delete existed. Every one was authored by the owner.

Evidence (merge-tree against `origin/main`, `gh pr list --head`, `git ls-remote`):

- None of the 59 is content-identical to `main`: 36 would add changes, 23 conflict.
- 44 had a PR (38 closed, 6 merged with commits pushed afterwards); 15 never had one.
- For 36 of the 44, `refs/pull/N/head` equals the branch tip, so GitHub keeps the commits
  after the branch is deleted (the PR page "Restore branch" button relies on this).
- The other 23 (8 with post-PR commits, 15 with no PR) exist only as branches.
- No workflow triggers on a tag push (deploys fire on `release: published`), and the repo
  already holds 8 `archive/<branch>-<date>` tags from an earlier cleanup.
- 9 of the 59 changed after 2026-09-01 (latest 2026-11-03) and may still be in use.

Of the 6 commits pushed after their PR merged, 4 are already in `main` or superseded; the
2 that never shipped are tracked in #3025.

## Decision

Archive, then delete, in one pass for the 50 branches last changed before 2026-09-01:

1. **33 branches whose tip equals their `refs/pull/N/head`:** delete. The PR keeps the commits.
2. **17 branches with no recovery path:** push an annotated tag
   `archive/<branch, slashes as dashes>-2026-11-13` at the tip, confirm with `git ls-remote`
   that it resolves to that SHA, then delete the branch.
3. Every delete is lease-guarded (`--force-with-lease=refs/heads/<b>:<sha>`) and pushed with
   `--atomic`, so a branch that moved after the check is left alone.
4. **9 branches changed since 2026-09-01:** deferred to the 2026-12-13 revisit, where the same
   rules apply.

Tag names were checked: no duplicates after the slash-to-dash mapping and no clash with an
existing tag or branch. Executed 2026-11-13 on the owner's go-ahead: 17 tags pushed and verified,
50 branches deleted in one atomic, lease-guarded push.

## Alternatives considered

| Option                                         | Why rejected                                                                               |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------ |
| A. Keep all 59                                 | Nothing improves; the dead branches hide the few that matter.                              |
| B. Delete all 59, no tags                      | The 23 tips with no PR ref would be left to GitHub garbage collection.                     |
| D. Delete the 33, keep the 17                  | Safe, but the hardest cases stay and need another review. It is this decision minus tags.  |
| E. Delete only branches idle 60+ days          | Age is the wrong test; recoverability is. It deletes old no-PR tips with no backup.        |
| F. One issue per branch                        | 59 issues is noise. Only the unshipped post-merge commits warranted one (#3025).           |
| Hidden refs (`refs/archive/*`) instead of tags | Not fetched by default and invisible in the UI, so harder to find; some mirrors skip them. |

## Consequences

- The branch list drops from 69 to 19 (5 open PRs, 5 `archive/*`, 9 deferred).
- `archive/*` tags grow from 8 to 25. Every clone fetches them; no tooling reacts to them.
- Recovery: `git push origin <tag-or-refs/pull/N/head>:refs/heads/<branch>` restores any branch.
- `refs/pull/N/head` retention is observed GitHub behavior, not a documented guarantee, and it
  only exists in this repository.

## Revisit when

- **2026-12-13:** decide the 9 deferred branches.
- **The repository moves host, is transferred, or gets a mirror:** `refs/pull/*` would not
  travel. Take a `git bundle` of every archived tip before relying on PR refs.
- **A branch tip is found to hold a secret:** purge it instead of archiving.
