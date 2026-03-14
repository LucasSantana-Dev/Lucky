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

2. Inspect PR status using required checks only:

```bash
gh pr checks <PR#> --required
```

3. Classify failure bucket:

- `token-permission`: secret/project access mismatch
- `quality-gate`: coverage/duplication/new-code thresholds
- `workflow-runtime`: action/runtime failure

4. Apply minimal fix in this order:

- CI contract mismatch first
- then branch drift/rebase
- then quality/test deltas

5. Merge safety:

```bash
SHA=$(gh pr view <PR#> --json headRefOid --jq .headRefOid)
gh pr merge <PR#> --squash --match-head-commit "$SHA"
```

## Dependabot Sonar policy (Lucky)

- Non-Dependabot runs: Sonar token required and enforced
- Dependabot runs without token: scanner path must skip as success
- Required status names must remain stable with ruleset contexts

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
