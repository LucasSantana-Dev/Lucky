---
name: ship-it
description: 'Take a merged PR to production: changelog-update --bump, tag/release, deploy, post-deploy verify. --from tag starts at the tag phase. For "live in prod, verified". Unmerged work: use merge-confidently.'
triggers:
    - ship-it
    - ship to prod
    - release to production
    - deploy to production
    - post-merge deployment
    - prepare release
    - tag a release
    - ship-it --from tag
user-invocable: true
auto-invoke: post-merge-deployment + release-requests
metadata:
    owner: global-agents
    tier: contextual
    canonical_source: /Users/lucassantana/.claude/skills/ship-it
---

# Ship It

Replaces "merged the PR, now what?" with one workflow that gets the change live and
verified. Pairs with `merge-confidently` (which ends at merge); `ship-it` starts
where that ends.

## Other-author PRs: halt

CLAUDE.md hard rule: never automate any action on a PR with comments from another
person or on an open PR authored by another person (bots do not count). Run the
halt check in `merge-confidently` (section "Other-author PRs: halt") before acting
on the PR being shipped. Bot-authored release PRs (release-please) pass that check
and proceed. Release workflow details: `references/release-workflow.md`.

## Auto-invocation triggers

- User says "ship to prod", "release this", "deploy to production"
- After `merge-confidently` returns successful merge if release/deploy is implied
- Scheduled releases (weekly/biweekly cadence)

## Modes

- default: Phases 1 to 5.
- `--from tag`: start at Phase 2 and stop after Phase 2 (tag + GitHub release) for a
  version that is already bumped. No merge, no version bump, no deploy. Add `--deploy`
  to continue with Phases 3 and 4 (deploy, verify). Used by `hotfix` (with `--deploy`)
  and by callers that did the bump themselves. The SHA to tag is the explicit SHA the
  caller passes, else the merged bump PR's `mergeCommit` (`gh pr list --state merged
--head chore/bump-X.Y.Z --json number,mergeCommit`), and the version in the
  manifest at that SHA must equal X.Y.Z; if the lookup is empty or the version differs,
  ask the user. Never default silently to HEAD.

## Rollback gate (every mode, before anything ships)

Before merging a release PR, tagging or deploying (including release-please mode and
`--from tag`), for any main-branch release or production infra change (Cloudflare,
homelab, Dockerfile rewrite), state a rollback plan:

```
Rollback plan:
  Revert steps: [e.g. git revert <tag>, re-deploy previous tag]
  Commands: [exact commands]
  Estimated recovery time: [~X minutes]
```

User confirmation (T3) is required only when this run will reach production: (a) a
deploy phase runs (`--deploy`, release-please mode, or full mode), OR (b) pushing the
tag triggers a prod deploy workflow (check `.github/workflows/*` for `on.push.tags`
or `release: published` triggers that deploy). When it fires, state the plan and
require user confirmation before proceeding.

`--from tag` without `--deploy` and with no tag-triggered deploy workflow deploys
nothing: state the rollback plan in one block (delete nothing, never retag, revert
via PR and ship a patch) and proceed without asking.

If no rollback plan can be formulated, halt and ask the user before proceeding.
Exempt: feature-branch preview deploys, staging-only changes, hotfixes reverting a
prior bad deploy.

## Workflow

### Phase 1: Version + changelog (always; skipped with `--from tag`)

- **release-please repos (the default since 2026-07-23):** release-please owns
  version bump, changelog promotion, and the tag via its release PR. After the
  rollback gate above, merge the pending release PR and skip to Phase 3
- **Repos without release-please:** compute `NEXT_VERSION` from conventional
  commits since the last tag (`git log $(git describe --tags --abbrev=0)..HEAD
--format=%s`: any `!`/BREAKING is major, any `feat` is minor, else patch), then
  invoke `changelog-update --bump NEXT_VERSION` (it bumps all package versions,
  refreshes the lockfile, promotes the changelog and opens a PR; it arms
  auto-merge only if the repo allows it, else it leaves the PR open and reports,
  then stop and wait for the user). Wait until the bump PR is MERGED (`gh pr view
<bump> --json state,mergeCommit`), then `git pull --ff-only` on main.

### Phase 2: Tag + GitHub release (always)

The rollback gate above has already run.

Runs on the bump merge SHA (the `mergeCommit` from Phase 1; release-please repos: the
release PR merge SHA; `--from tag`: the SHA the caller passes or the merged bump PR's `mergeCommit`).

Preconditions (hard-fail if any miss):

- on `main`, up to date with `origin/main`, `git status` clean
- version `X.Y.Z` already bumped in the manifest (package.json etc.)
- CHANGELOG already promoted: a `[X.Y.Z]` section exists
- tag `vX.Y.Z` absent locally (`git tag -l vX.Y.Z`) and on origin:
  `git ls-remote --exit-code --tags origin refs/tags/vX.Y.Z` must exit 2 (absent)
- Tag already exists (locally or on origin, `ls-remote` exit 0): STOP before any tag or release step. Do not run or propose `gh release create`, a retag, a tag delete or a force push as the next step, even conditionally. Report the existing tag object SHA exactly as `ls-remote` prints it (full SHA), say whether it matches the bump merge SHA, and ask the user to investigate or pick a new version.
- `<sha>` is the bump merge SHA (caller-passed, else the bump PR's `mergeCommit`; never an implicit HEAD)

Steps:

1. `git tag -a vX.Y.Z -m "vX.Y.Z" <sha>`
2. `git push origin vX.Y.Z`
3. `gh release create vX.Y.Z --verify-tag --notes-file <file>` where the file holds
   the CHANGELOG `[X.Y.Z]` section (default; `--notes-from-tag` only if asked;
   add `--latest` for hotfixes)
4. verify: `gh release view vX.Y.Z` and the tag resolves on origin

Refuse force-retag: if the tag exists anywhere, stop and surface it. Never
`git tag -f`, `git push --force` or `--admin`.

With `--from tag` and no `--deploy`, Phase 2 is the last phase: put stop conditions
and caveats before the commands, and end the reply with step 4 (verification).

### Phase 3: Deploy (always, except `--from tag` without `--deploy`; pick the right deployer)

Detect deployment target from project:

- Vercel (`vercel.json`, Next.js): invoke `vercel-deploy`. Use `--prod` when the user asked to ship or deploy to prod (hotfix counts); when auto-invoked, confirm first. Deploy from a clean checkout at the tag; if the project has Vercel Git integration, verify the Git-triggered prod deploy instead. Never use vercel-deploy's no-auth fallback
- Cloudflare Workers/Pages (`wrangler.toml`): invoke `cloudflare-deploy`
- Lucky (Docker on homelab): the published release triggers `deploy.yml`; watch it. `prod-rebuild` is Lucky-only
- Generic CI/CD: the pipeline deploys; trigger or watch the deploy workflow for the release SHA (`gh run watch`). If no deploy stage exists, stop and route setup to `ci-cd` DEPLOY

### Phase 4: Post-deploy verify (always, except `--from tag` without `--deploy`)

- Wait 60s for deploy to settle
- Invoke `sentry` to check for new issue events post-deploy
- Invoke `gh-fix-ci` in report-only commit/branch mode (`--commit <sha>` or `--branch main`) to verify any post-deploy smoke checks passed
- Hit a health endpoint if known (curl `/health`, `/version` to confirm new version is live). ship-it's verify phase may curl `/health`; this overrides vercel-deploy's do-not-curl rule for prod verification

If Sentry shows any new issue with frequency >0 in the post-deploy window, escalate
to `incident-response` composite.

### Phase 5: Capture (conditional)

- If release contains breaking changes: invoke `adr-write` to record migration notes
- If release is significant (minor/major): invoke `knowledge-loop` to save the
  shipping summary for future reference

## Reconciliation

```
SHIP IT — <repo> v<old> → v<new>
  Version:     <bump type>, commits since last tag: N <STATUS>
  Changelog:   M entries promoted from Unreleased <STATUS>
  Tag:         v<new> pushed <STATUS>
  Deploy:      <target>, took Xs <STATUS>
  Verify:      sentry clean, /health ok, version endpoint shows v<new> <STATUS>
  Captured:    ADR-NNNN (if breaking) <STATUS>
  Snapshot:    <path to release log | (none, task ongoing)>
  Open watch:  <future obligation | (none)>
```

## Outputs / Evidence

- New version + tag
- Changelog entries published
- Deploy target + URL
- Post-deploy verification proof (Sentry clean, health endpoint live)
- ADR if applicable

## Failure / Stop Conditions

- Phase 1 reveals uncommitted changes → stop, commit first
- Phase 2 fails (tag conflict, any precondition missed) → stop, investigate; never retag
- Phase 3 deploy fails → stop, surface error, do NOT auto-rollback (that's
  `incident-response` territory)
- Phase 4 finds new Sentry issues → STOP, escalate to `incident-response`
- Never use `--force-with-lease` or `--admin` to push past gates

## Memory Hooks

- Read deployment history per-repo to detect cadence patterns (e.g., "Lucky ships
  Tuesdays")
- Write release outcome to memory for trend tracking (deploy time, issue count
  post-deploy, rollback rate)
