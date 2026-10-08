---
name: dep-sweep
description: 'Batch-process Dependabot/Renovate PRs by risk: auto-merge safe ones, surface risky ones for review. Use when bot PRs pile up.'
user-invocable: true
auto-invoke: >-
    "dependabot PRs", "renovate queue", "clean up bot PRs", "update deps", weekly if ≥10 open bot PRs
metadata:
    owner: global-agents
    tier: contextual
    canonical_source: /Users/lucassantana/.claude/skills/dep-sweep
triggers:
    - dependency sweep
    - update deps
    - bot prs
    - dependabot
---

# Dep Sweep

Turn a wall of bot PRs into one decision pass. Auto-merges the safe class
into the resolved base branch (`main` by default; a repo that's explicitly
opted into the release-train exception uses its configured `release_branch`
instead — see Resolve target below) and surfaces only the genuinely risky
updates for human review. Reduces the daily/weekly drag of "20 dependabot
PRs are open and I keep ignoring them".

## Auto-invocation triggers

- User says "deal with dependabot", "clean up renovate", "update deps",
  "merge the bot PRs"
- ≥10 open PRs authored by `dependabot[bot]`, `renovate[bot]`, or `pre-commit-ci[bot]`
- Weekly cadence if the repo has automated dep updates configured

## Risk classification (always first)

For each open bot PR, classify into one of:

Evaluate HOLD conditions first, then REVIEW, then AUTO-MERGE — a patch bump
with passing CI that's _also_ a security advisory is HOLD, not AUTO-MERGE.
Security advisories never qualify for AUTO-MERGE regardless of bump size or
CI status; the "safe" heuristics below only apply once HOLD is ruled out.

| Bucket                | Heuristic                                                                                                                                                           | Default action                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| **HOLD (risky)**      | Security advisories, OR major bumps, OR bumps that fail CI, OR dependencies listed in `always_hold` in `.claude/dep-sweep-config.json`                              | Comment on PR with reason; leave open |
| **REVIEW (medium)**   | Minor bumps of runtime deps, OR any bump that touches a known-sensitive package list (see project config)                                                           | Surface to user with diff summary     |
| **AUTO-MERGE (safe)** | devDependencies only, OR patch bumps to any dep with passing CI, OR lockfile-only resyncs, OR pre-commit hook bumps — none of which are also a HOLD or REVIEW match | Auto-merge into the resolved target   |

Sensitive package list defaults: `react`, `next`, `vue`, `svelte`, anything
matching `^@types/node$`, `eslint`, `typescript`, ORM packages (`prisma`,
`drizzle-orm`, `typeorm`), test frameworks (`vitest`, `jest`, `playwright`),
bundlers (`vite`, `webpack`, `turbo`, `rollup`).

Override via `.claude/dep-sweep-config.json`:

```json
{
    "sensitive": ["@my-org/internal-sdk"],
    "always_hold": ["legacy-package"],
    "auto_merge_minor": false
}
```

## Workflow

### Resolve target (before anything else)

Read `.claude/release-cadence-config.json` if it exists. If `model ==
"release-train"`, target = its `release_branch`. Otherwise target = `main`.
This is the single canonical source — don't also read a `base_branch` key
from `dep-sweep-config.json`; duplicating the same value into two config
files is how they drift. Every later phase (confirmation prompt,
verify/retarget, reconciliation) uses this resolved target.

### Phase 1 — Enumerate

```bash
gh pr list --state open --json number,title,author,headRefName,labels,baseRefName \
  --jq '[.[] | select(.author.login | test("dependabot|renovate|pre-commit-ci"))]'
```

If empty: STOP with "No bot PRs open."

### Phase 2 — Classify

For each PR, fetch:

- `gh pr view <n> --json files,additions,deletions`
- Title parsing for bump type (`major|minor|patch` from semver delta)
- Files changed (lockfile-only? config? runtime imports?)

Assign bucket per the table above. Show the classification table to user:

```
AUTO-MERGE (12):
  #421 chore(deps): bump @types/node 22.7 → 22.8
  #423 chore(deps-dev): bump vitest 1.6.0 → 1.6.1
  ...
REVIEW (4):
  #418 chore(deps): bump next 14.2 → 14.3
  ...
HOLD (2):
  #410 chore(deps): bump react 18 → 19          [major]
  #415 chore(deps): bump prisma 5 → 6           [major, ORM]
```

### Phase 3 — Confirm

Single user confirmation, using the target resolved above: "Auto-merge the
12 AUTO-MERGE PRs into `<resolved target>`, surface the 4 REVIEW for you,
leave the 2 HOLD with explanatory comments? (y/N)"

On `n`: STOP and ask which buckets to act on.

### Phase 4 — Auto-merge bucket

For each AUTO-MERGE PR, in parallel batches of 3:

- Verify base branch matches the resolved target
    - If it doesn't, retarget via `gh pr edit --base <resolved target>` — never
      hardcode `main` here; a release-train repo's stale PRs should retarget to
      its configured `release_branch`, not away from it
- Invoke `pr-merge-readiness` — must return MERGE
- On MERGE: squash-merge
- On WAIT/FIX: demote to REVIEW bucket, comment on PR with reason

Stop the parallel processing if 3 consecutive merges fail (likely systemic CI
issue) and surface to user.

### Phase 5 — Review bucket

For each REVIEW PR, produce a one-paragraph summary:

- What changed (link to dep changelog if visible)
- Why bumped (security advisory? scheduled?)
- CI status
- Suggested action (merge / wait / close)

Surface as a single decision list. Do NOT auto-merge this bucket.

### Phase 6 — Hold bucket

For each HOLD PR, leave a comment:

> "Held by `/dep-sweep` because: <reason>. Requires manual review before merge."

Apply label `needs-human` if it doesn't already have one.

### Phase 7 — Changelog batch entry

Check for release-please first. Filename alone isn't reliable (repos name
the workflow file freely) — check for either:

- `release-please-config.json` present at repo root, OR
- any `.github/workflows/*.y*ml` referencing a release-please action:
  `grep -l "release-please-action" .github/workflows/*.y*ml`

- **release-please repo:** skip this phase entirely. The `chore(deps):`
  commits from Phase 4's squash-merges already feed the pending release PR
  automatically — a manual append would violate `standards/release-cadence
.md`'s no-manual-`[Unreleased]`-bookkeeping rule and double-count the bump.
- **No release-please:** append a single line under `[Unreleased]`:

    > `### Changed`
    > `- Bumped N dependencies (devDeps + patches). See PRs <list>.`

    This collapses 12 individual changelog entries into one.

## Stop / escalation conditions

- 3 consecutive AUTO-MERGE failures → halt and surface (CI may be broken)
- A bot PR has a human review with CHANGES_REQUESTED → skip and treat as HOLD
- Dependency in any PR matches `always_hold` → force HOLD regardless of other signals

## Reconciliation

```
DEP SWEEP — <repo>
  Enumerated:    18 bot PRs <STATUS>
  Auto-merged:   12 into <resolved target> (devDeps + patches) <STATUS>
  For review:    4 (next 14.2→14.3, eslint 9.0→9.1, ...) <STATUS>
  Held:          2 (react v19 major, prisma v6 major) <STATUS>
  Changelog:     1 batched line added under [Unreleased] | skipped (release-please owns it) <STATUS>
  Snapshot:      <path to state file | (none — task ongoing)>
  Open watch:    <future obligation | (none)>
```

## Outputs / Evidence

- Per-bucket PR list with bump deltas
- Auto-merge SHA list
- Comments left on HOLD PRs
- Single batched CHANGELOG entry (non-release-please repos only)

## Configuration

Repo-level overrides live in `.claude/dep-sweep-config.json`. Base branch is
NOT configured here — it's resolved from `.claude/release-cadence-config.json`
(see Resolve target above), so it can't drift between the two files.

```json
{
    "sensitive": ["@my-org/internal-sdk"],
    "always_hold": ["webpack"],
    "auto_merge_minor": false,
    "auto_merge_dev_deps": true
}
```

## What this composite is NOT

- Not a security-vuln workflow → use `/security-sweep` for advisories
- Not a single-PR review tool → use `/merge-confidently` for one PR at a time
- Not a release cut → release-please (or `/ship-it`) ships the accumulated batch

## Pairs with

- `/merge-confidently` — for non-bot PRs that pile up
- `/security-sweep` — when bumps are security-driven
