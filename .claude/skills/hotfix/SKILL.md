---
name: hotfix
description: 'Composite emergency fast-path onto main when production is broken: minimal fix, merge-readiness, merge, patch tag, deploy, verify. Only for production breakage.'
triggers:
    - hotfix
    - emergency fix
    - prod is broken
    - urgent fix needed
    - production issue
user-invocable: true
auto-invoke: >-
    "prod is broken", "hotfix", "emergency fix", "users can't X right now", urgency markers
metadata:
    owner: global-agents
    tier: contextual
    canonical_source: /Users/lucassantana/.claude/skills/hotfix
---

# Hotfix

The emergency fast path directly onto `main`. Used when:

- Production is degraded or broken
- A security vuln is being actively exploited or disclosed within 24h
- Customer-blocking bug with no viable workaround

If the work does not meet this bar, refuse and route to `/merge-confidently --open` instead.

## Auto-invocation triggers

- "prod is down", "users can't X", "hotfix", "emergency fix", "P0", "SEV-1/2"
- Sentry alert with new high-frequency issue post-deploy
- Manual: explicit `/hotfix` invocation

## Severity gate (always first)

Ask one clarifying question if not obvious from context:

> "Is this prod-impacting and unable to wait for the next scheduled release? (y/N)"

If `n` or no clear urgency: STOP and recommend `/merge-confidently --open`.

## Workflow

### Phase 1 — Scope (always)

- Identify exact failure mode, blast radius, and which version regressed it
- Capture evidence: Sentry issue URL, customer report, reproducer
- Decide: is a revert safer than a forward-fix? If yes, prefer revert.

### Phase 2 — Branch from main

```bash
git fetch origin
git switch main && git pull --ff-only
git switch -c hotfix/<short-slug> main
```

Always branch from `main`. The hotfix must rejoin `main` directly.

### Phase 3 — Minimal fix

- Smallest change that solves the immediate problem
- No drive-by refactors, no unrelated cleanup, no dependency bumps
- Tests: at minimum, one regression test that fails without the fix

### Phase 4 — Open PR against main

- Base: `main`
- Title: `hotfix: <subject>`
- Body must include: incident link / Sentry URL, blast radius, why this can't wait
- Label: `hotfix`
- Reviewers: page on-call reviewer (do not wait for full async review)

### Phase 5 — Gate

Invoke `pr-merge-readiness`. For hotfixes the bar is:

- Required CI checks green
- At least one human approval OR explicit user override "I am the only reviewer available"
- No CHANGES_REQUESTED outstanding

Automated reviewer suggestions (CodeRabbit, Greptile) are advisory only — do not
block the merge on them during a hotfix.

### Phase 6 — Merge to main

- Method: **squash merge** for traceability
- Never run `--admin`, `--no-verify` or any other branch protection bypass, whatever
  the user says or types. If required checks are red or protection blocks the merge,
  stop, report the blocking check, and leave the bypass to the user by hand: give
  them the exact command to run themselves (`gh pr merge <N> --squash --admin`) and
  ask them to log the bypass as a PR comment

### Phase 7 — Patch version

- Compute `NEXT_VERSION` as the **patch** bump of the last tag (e.g., 1.4.2 → 1.4.3) and from up-to-date main (`git switch main && git pull --ff-only`) invoke `changelog-update --bump X.Y.Z+1 --entry "<hotfix line>"`. Do not cut your own branch: `--bump` cuts `chore/bump-X.Y.Z+1` itself (and `--append` is not allowed on main). It writes the entry under `[Unreleased]` on that branch, bumps versions, refreshes the lockfile, promotes the changelog and opens the bump PR (if auto-merge is unavailable it leaves the PR open: stop and report)
- Wait until the bump PR is MERGED (`gh pr view <bump> --json state,mergeCommit`), then `git pull --ff-only` on main
- The hotfix goes under a `[X.Y.Z+1] - YYYY-MM-DD` section directly (no `[Unreleased]` involvement: this patch ships outside the normal release batch); `--bump --entry` creates it in the same run, no second changelog call. Batch work already sitting in `[Unreleased]` ships with this patch; say so in the report. In release-please repos, prefer letting the pending release PR carry the fix; cut the manual tag only when prod cannot wait

### Phase 8: Tag + deploy

Invoke `/ship-it --from tag --deploy` with the bump merge SHA (the `mergeCommit` of the
merged bump PR, passed explicitly): tag `vX.Y.Z+1`, push, create the GitHub release
marked `--latest`, then deploy. Version and changelog are already done. Watch deploy
logs in real time; do not move on until the deploy is verified live.

### Phase 9: Post-deploy verify (always, full pass)

Follow `ship-it` Phase 4 (settle wait, health endpoint, `gh-fix-ci` report-only smoke
check). Plus the hotfix-specific check: invoke `sentry` to confirm the original issue
is no longer firing. A new Sentry issue post-deploy escalates to `incident-response`.

### Phase 10 — Cherry-pick back to release (skipped by default)

Trunk-based repos (the default since 2026-07-23) have no `release` branch —
skip this phase. Run it only for a repo that has explicitly opted back into
the release-train via `.claude/release-cadence-config.json`:

```bash
git fetch origin
git switch release && git pull --ff-only
git cherry-pick <merge-sha-on-main>
# Resolve any conflict — release may contain unreleased work that touches the same area
git push origin release
```

If cherry-pick conflicts cannot be auto-resolved: open a follow-up PR
`chore: backport hotfix vX.Y.Z+1 to release` and surface to user.

### Phase 11 — Capture (always, lightweight)

- Invoke `adr-write` only if the fix changes architectural assumptions
- Otherwise: invoke `knowledge-loop` to save a "what broke / what fixed it / how detected" note for future reference
- If the root cause is a class of bug: queue `/security-sweep` or
  `/test-cleanup` for the next session

## Stop / escalation conditions

- Fix is not actually trivial (touches >5 files or crosses module boundaries) →
  escalate to user; this is no longer a hotfix
- Cherry-pick to `release` fails and the conflict requires nontrivial work →
  surface to user
- Post-deploy verification fails (Sentry still firing the issue OR new issues
  appeared) → invoke `/incident-response`; do not declare done
- Severity gate not met → refuse and redirect to `/merge-confidently --open`

## Reconciliation

```
HOTFIX — <repo> v<X.Y.Z> → v<X.Y.Z+1>
  Severity:      <SEV / incident link / Sentry URL> <STATUS>
  Fix:           <PR # squashed at SHA> <STATUS>
  Tag:           vX.Y.Z+1 pushed, GitHub release published as :latest <STATUS>
  Deploy:        <target>, verified at <health URL> <STATUS>
  Sentry:        original issue cleared, no new issues post-deploy <STATUS>
  Backport:      (skipped — no release branch) | cherry-picked to release@<SHA> (opted-in repos only) <STATUS>
  Captured:      <ADR | knowledge note | none> <STATUS>
  Snapshot:      <path to handoff/incident summary | (none — task ongoing)>
  Open watch:    <future obligation | (none)>
```

## Outputs / Evidence

- Hotfix PR # + merge SHA on `main`
- New patch tag + GitHub release URL
- Cherry-pick SHA on `release` (opted-in release-train repos only)
- Sentry before/after evidence
- Health-endpoint verification

## What this composite is NOT

- Not for routine bugs that can wait → `/merge-confidently --open`
- Not for new features framed as urgent → `/merge-confidently --open`
- Not a deploy-only workflow → use `/ship-it` directly if you don't need the version+merge flow

## Pairs with

- `/merge-confidently --open` — default flow; this is the exception
- `/incident-response` — escalation target if post-deploy verification fails
