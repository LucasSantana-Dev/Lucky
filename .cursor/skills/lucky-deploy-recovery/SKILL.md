---
name: lucky-deploy-recovery
description: Use when Lucky Deploy to Homelab fails due webhook lock contention, dirty checkout drift, or runtime precheck failures.
---

# Lucky Deploy Recovery

## When to use

- `Deploy to Homelab` is red on `main`
- Webhook response returns `another deploy is already running`
- Webhook response mentions local changes, overwritten merge files, or unmerged files
- Auth-config smoke never starts because webhook trigger failed

## Failure buckets

- `LOCK_CONTENTION`: concurrent webhook deploy already running
- `CHECKOUT_RECOVERY_FAILED`: target checkout drift or merge-conflict state
- `RUNTIME_PRECHECK_FAILED`: compose/migration/health precheck failed after webhook accepted

## Triage sequence

1. Confirm latest failing run and failed step log:

```bash
gh run list --branch main --workflow "Deploy to Homelab" --limit 5
gh run view <RUN_ID> --log-failed
```

2. Validate target host checkout state:

```bash
ssh server-do-luk 'cd /home/luk-server/Lucky && git status --short --branch'
```

3. If dirty checkout is present, archive drift and clean checkout:

```bash
ssh server-do-luk 'cd /home/luk-server/Lucky && git stash push -u -m "manual-deploy-unblock-$(date -u +%Y%m%dT%H%M%SZ)"'
ssh server-do-luk 'cd /home/luk-server/Lucky && git fetch origin main && git reset --hard origin/main && git clean -fd'
```

4. Rerun deploy workflow:

```bash
gh run rerun <RUN_ID>
gh run watch <RUN_ID> --exit-status
```

5. Post-deploy smoke:

```bash
curl -i https://lucky.lucassantana.tech/api/health
curl -i https://lucky.lucassantana.tech/api/health/auth-config
curl -i https://lucky.lucassantana.tech/api/auth/discord
```

## Rerun policy

- One immediate rerun is allowed for `LOCK_CONTENTION`.
- If rerun still fails with `CHECKOUT_RECOVERY_FAILED`, perform host checkout cleanup before another rerun.
- Do not keep blind rerunning on repeated `CHECKOUT_RECOVERY_FAILED`; require host cleanup evidence first.

## See also

- `deploy-homelab` skill for full architecture, SSH access, container details, and manual deploy procedures
