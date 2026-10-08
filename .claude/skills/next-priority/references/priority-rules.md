# Priority Rules

> Canonical decision order lives in `SKILL.md` — this file holds PR-state
> interpretation detail only. (A divergent 6-tier ranking + 5-weight scoring
> table lived here until 2026-07-09; removed — two ranking mechanisms was the
> defect. SKILL.md's tier list is the single source of truth.)

## Common advisory-only checks (not required by default)

These appear as `fail` in `gh pr checks` but are **never** required unless a ruleset
explicitly lists them — do NOT call a PR CI-blocked because of these alone:

| Check                                           | Reason it's advisory                                               |
| ----------------------------------------------- | ------------------------------------------------------------------ |
| `SonarCloud Code Analysis`                      | External quality gate; required only if ruleset lists it           |
| `Test Autogen (Warn)`                           | Explicitly warn-only; job-level `continue-on-error: true` intended |
| `GitGuardian Continuous Monitoring`             | Post-merge; shows as `skipping` on PRs                             |
| `Vercel Preview Comments`                       | Notification only, not a gate                                      |
| CodeRabbit checks with `pass: Review completed` | Informational                                                      |

**Always verify against the actual ruleset:**

```bash
gh api repos/<owner>/<repo>/rulesets | python3 -c "
import json,sys
for rs in json.load(sys.stdin):
    if rs.get('enforcement')=='active':
        for r in rs.get('rules',[]):
            if r.get('type')=='required_status_checks':
                print([c['context'] for c in r.get('parameters',{}).get('required_status_checks',[])])
"
# Also check legacy branch protection
gh api repos/<owner>/<repo>/branches/main/protection 2>/dev/null | \
  python3 -c "import json,sys; p=json.load(sys.stdin); print(p.get('required_status_checks',{}).get('contexts',[]))"
```

## GitHub mergeStateStatus reference

| Status      | Meaning                                                                    | Action                                                     |
| ----------- | -------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `CLEAN`     | All required checks pass, no conflicts, policy satisfied                   | Merge                                                      |
| `BLOCKED`   | Required check failing OR `CHANGES_REQUESTED` review blocking              | Fix the blocker                                            |
| `UNSTABLE`  | All required checks pass but some non-required checks fail                 | Treat as `green with advisory noise` — merge is safe       |
| `DIRTY`     | Merge conflict against base branch                                         | Rebase or merge base into PR branch                        |
| `UNKNOWN`   | GitHub is computing state OR stale-base (base already merged into default) | Wait a moment, then re-check; if base is merged → retarget |
| `HAS_HOOKS` | Merge blocked pending pre-receive hooks                                    | Rare; treat as BLOCKED                                     |

**DIRTY ≠ CI failure.** A DIRTY PR with all-passing required checks is merge-blocked
only by the conflict — fix the rebase, CI reruns, then merge.

**UNSTABLE ≠ CI failure.** `UNSTABLE` means GitHub detects non-required failing checks.
Always verify required-vs-advisory before treating as blocked.

## Rules

- Resolve effective required contexts from branch protection **and** rulesets before calling a
  PR blocked, clean, or merge-ready. Both mechanisms can be active simultaneously.
- Required checks beat raw momentum.
- Non-required or advisory check failures do not make a PR CI-blocked.
- Green checks do not make a PR merge-ready if unresolved review comments still point to
  functional, user-visible, security, or release-risk defects.
- Required approvals still block merge readiness even when required checks are green.
- Use `green with advisory noise` for PRs whose required checks are green but advisory
  checks are noisy (maps to `UNSTABLE` mergeStateStatus).
- Use `green but review-blocked` for PRs whose required checks are green but approval or
  `CHANGES_REQUESTED` review state prevents merge; dismiss stale bot reviews when all issues addressed.
- Use `stale-base` for open PRs whose base branch has been merged into the default branch;
  these show `UNKNOWN` merge state and must be retargeted or recreated.
- Token or permission failures in CI contract work should be prioritized ahead of feature work.
- Claimed tasks stay out of recommendations until released back to the queue.
- Whether to act or ask after picking a task (claiming it, creating a plan) is decided by the
  autonomy tiers; see "Act or ask" in `SKILL.md`. No blanket confirmation stop.
- When a squash-merge strategy is in use, rebasing a stale-base branch onto default may
  silently skip commits (patch-id collision). Always verify with `git log origin/<default>..<head>`
  after rebase and use `git cherry-pick <sha>` if commits were dropped.
