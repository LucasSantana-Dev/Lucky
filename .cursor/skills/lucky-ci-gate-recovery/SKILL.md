---
name: lucky-ci-gate-recovery
description: Use when Lucky PRs are blocked by required-check failures, especially SonarCloud or Dependabot CI contract mismatches.
---

# Lucky CI Gate Recovery

## When to use

- Required checks are blocking merge despite low-risk changes
- Sonar checks fail only on Dependabot PRs
- CI status appears contradictory (workflow pass + required status fail)
- You need a deterministic merge-safety checklist before release

## Required sequence

1. Capture required checks from active ruleset:

```bash
REPO_SLUG=$(git remote get-url origin | sed 's#.*github.com[:/]\(.*\)\.git#\1#' | sed 's#.*github.com[:/]\(.*\)#\1#')
gh api repos/"$REPO_SLUG"/rulesets \
  --jq '.[] | select(.enforcement=="active") | .rules[]? | select(.type=="required_status_checks") | .parameters.required_status_checks[].context'
```

2. Build a required-vs-informational status matrix:

```bash
PR=<PR#>
gh pr view "$PR" --json statusCheckRollup \
  --jq '.statusCheckRollup[] | {name: .name, conclusion: (.conclusion // "PENDING"), status: (.status // "UNKNOWN")}'
```

3. Inspect required checks only:

```bash
gh pr checks <PR#> --required
```

4. Classify failure bucket:

- `token-permission`: secret/project access mismatch
- `quality-gate`: coverage/duplication/new-code thresholds
- `workflow-runtime`: action/runtime failure
- `ruleset-mismatch`: required context name differs from workflow-reported check

5. Apply minimal fix in this order:

- Ruleset/context mismatch first
- CI contract mismatch second
- then branch drift/rebase
- then quality/test deltas

6. Merge safety:

```bash
SHA=$(gh pr view <PR#> --json headRefOid --jq .headRefOid)
gh pr merge <PR#> --squash --match-head-commit "$SHA"
```

## Dependabot Sonar policy (Lucky)

- Non-Dependabot runs: Sonar token required and enforced
- Dependabot runs without token: scanner path must skip as success
- Required status names must remain stable with ruleset contexts

## Deploy webhook failure signatures

When CI/CD push checks are green but `Deploy to Homelab` fails in webhook trigger, classify quickly:

- `dirty-tree-overwrite`:
    - body includes `error: Your local changes to the following files would be overwritten by merge`
    - fix: clean tracked workspace changes on host, then retry deploy
- `deploy-lock-collision`:
    - body includes `ERROR: another deploy is already running`
    - fix: wait for active deploy to finish; if stale lock suspected, verify lock PID command line before clearing
- `edge-timeout-noise`:
    - public webhook path returns timeout/504 while deploy may continue
    - fix: validate same request directly against webhook container endpoint (`http://<webhook-ip>:9000/hooks/deploy`) and confirm command output there

Use these signatures before changing workflow retry logic.

## Deterministic status policy

- Only statuses listed in required checks gate merge decisions.
- Pending informational checks (for example CodeRabbit/preview providers) are not blockers unless explicitly listed in the active ruleset.
- If a required status is missing entirely, treat as `ruleset-mismatch` until context names are reconciled.

## Post-merge smoke contract

```bash
curl -i https://lucky-api.lucassantana.tech/api/health
curl -i https://lucky-api.lucassantana.tech/api/health/auth-config
curl -i https://lucky-api.lucassantana.tech/api/auth/discord
```

Expect:

- `/api/health` => `200`
- `/api/health/auth-config` => `status: ok`
- `/api/auth/discord` => `302`
