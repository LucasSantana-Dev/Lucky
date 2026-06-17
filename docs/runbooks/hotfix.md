# Runbook: emergency hotfix to production

Ship a fix to the production homelab **now**, outside the normal release cadence,
when prod is actively broken and waiting for the next release is not viable.

This repo is **main-as-trunk** (no `release` branch) deployed to a single-operator
homelab box via Docker Compose. The generic global `/hotfix` skill assumes a
`release`-branch + manual-tag model and **does not apply here** — follow this
runbook instead.

> Decision record: `decisions/2026-06-17-hotfix-runbook-workflow-dispatch.md`.

## When to use this (severity gate — always first)

Use ONLY when prod is degraded/broken, a security issue is actively exploited, or
a customer-blocking bug has no workaround. Otherwise ship through the normal
PR → `main` → release flow (release-please once adopted; manual tag today).

A hotfix here **deploys an exact commit SHA's images**. It does **not** cut a
release or create a version tag — see step 7.

## The deploy machinery this relies on (read once)

- `docker-publish.yml` (on push to `main` touching `packages/**`, `prisma/**`,
  `Dockerfile*`, `nginx/**`, `package*.json`) builds **all four** service images
  (bot/backend/frontend/nginx) in one matrix run and tags each `:<short-sha>` +
  `:latest`. **A commit that touches only non-build paths (docker-compose.yml,
  docs, workflows) produces NO image — so `main` HEAD may not be deployable.**
- `deploy.yml` (`workflow_dispatch` with input `rollback_sha`, or on
  `release: published`) deploys a SHA: it `git reset --hard origin/main` for the
  working tree but pulls the **pinned `:<short-sha>` images** via `IMAGE_TAG`,
  runs `prisma migrate deploy`, health-gates (API + auth-config + OAuth contract),
  and **auto-rolls-back** to the last-good SHA on failure. If the pinned image
  can't be pulled it **aborts** (never builds current source under a pinned tag).
- `rollback_sha` is the only `workflow_dispatch` lever to deploy an _exact
  already-built SHA_, so it doubles as the "forward-deploy this SHA" mechanism.
- Concurrency is safe: `deploy.yml` has `concurrency: deployment-production`
  (no cancel) and the box `deploy.sh` holds a lockfile — parallel deploys queue.
- The `Production` GitHub environment has **no protection rules / no bake timer**
  — a dispatch deploy completes in ~1.5 min (box rollout ~2 min more).

## Procedure

### 1. Land the fix on `main`

Open a PR (`hotfix: <subject>`, label `hotfix`), keep the change minimal (one
regression test if feasible), and squash-merge to `main`. Prefer a **revert** over
a forward-fix when reverting is safer. If the fix is already on `main`, skip here.

### 2. Resolve the target SHA (the newest commit with built images that contains the fix)

Do **not** assume `main` HEAD — confirm it has a successful `docker-publish` run:

```bash
gh run list --repo LucasSantana-Dev/Lucky --workflow=docker-publish.yml \
  --limit 20 --json headSha,status,conclusion,createdAt,displayTitle \
  --jq '.[] | select(.status=="completed" and .conclusion=="success")
        | "\(.headSha[0:8]) \(.createdAt) \(.displayTitle)"'
```

Pick the **newest** SHA in that list that is an ancestor-or-equal of the fix
commit (i.e. contains the fix). `conclusion=="success"` means all four images
were pushed for that SHA. If `main` HEAD is a non-build commit (compose/docs only),
the fix's own build SHA is your target — the trailing non-build commits change
nothing in the running images.

Confirm the fix is in that SHA:

```bash
git fetch origin main -q
git merge-base --is-ancestor <fix-commit> <target-sha> && echo "fix is in target"
```

### 3. Pre-flight checks

```bash
# (a) No un-applied prisma migrations between current prod and target?
PROD_SHA=$(ssh homelab 'cat /home/luk-server/Lucky/.deploy-last-good-sha')
git diff --name-only "$PROD_SHA".."<target-sha>" -- prisma/migrations/
# Empty output = migration-free (lowest risk). If non-empty, the deploy WILL run
# them via `prisma migrate deploy`; proceed only if they are forward-safe, and
# note them in the GH run comment for traceability.

# (b) Box reachable + current state
ssh homelab 'docker ps --filter name=lucky-bot --format "{{.Image}} {{.Status}}"'

# (c) Rollback baseline is sane: .deploy-last-good-sha is the last HEALTHY
# deployed SHA (on-disk on the box, written by deploy.sh from the running image's
# COMMIT_SHA, persists across reboot). It must be a real 7-40 hex SHA and should
# differ from the target (else auto-rollback has nowhere to go).
echo "last-good (rollback target if this fails): $PROD_SHA"
```

### 4. Deploy

```bash
gh workflow run deploy.yml --repo LucasSantana-Dev/Lucky --ref main \
  -f rollback_sha=<target-sha>
```

(If — and only if — the target SHA equals `main` HEAD and HEAD has built images,
a plain `gh workflow run deploy.yml --ref main` also works. The `rollback_sha`
form is the safe default for any exact SHA.)

### 5. Monitor to a terminal state

```bash
# GH workflow
gh run list --repo LucasSantana-Dev/Lucky --workflow=deploy.yml -L 1 \
  --json databaseId,status,conclusion --jq '.[]'

# Box rollout (the deploy runs inside the webhook container)
ssh homelab 'docker exec lucky-webhook tail -40 /tmp/lucky-deploy.log'
```

Wait for `Deploy complete!` (success), `Rolled Back` (auto-rollback fired — fix
did not become healthy; the original breakage may persist), or a failure. The
GH run's "Validate deployed version" + auth-config + OAuth smoke steps gate
success externally.

### 6. Verify live

```bash
ssh homelab 'docker ps --filter name=lucky-bot --filter name=lucky-backend \
  --format "{{.Names}} {{.Image}} {{.Status}}"   # all on :<target-sha>, healthy
  && cat /home/luk-server/Lucky/.deploy-last-good-sha   # advanced to target'
```

Confirm in Sentry that the original issue stopped firing and no new issue
appeared. If a new issue appeared or auto-rollback fired → this is now an
incident, not a closed hotfix: escalate / investigate.

### 7. Do **not** cut a version tag

A hotfix deploys a SHA; it does not create `vX.Y.Z`. The fix is already on `main`
and will be included in the next normal release. Prod is briefly **ahead of the
latest release tag** until then — this is benign: release-please (once adopted)
tags the release commit at `main` HEAD, i.e. at-or-ahead of the hotfix, and the
box auto-rollback targets `.deploy-last-good-sha` (the hotfix), never the release
tag. Manually tagging here would conflict with the managed release flow.

## Failure / escalation

- Target SHA has no images (`docker-publish` failed) → wait for / re-run
  `docker-publish` for that SHA, or pick the prior built SHA that still contains
  the fix.
- Deploy aborts on `pinned image not found` → you picked an imageless SHA; redo
  step 2.
- `Rolled Back` in the log → the fix didn't pass health checks; prod is back on
  the previous good SHA but **still broken**. Investigate the fix; do not retry
  blindly.
- Box unreachable → surface to operator; do not force.

## Revisit / promote

If hotfix frequency rises enough that running these commands by hand is too slow,
promote steps 2–3 to a committed `scripts/hotfix.sh` (with `--dry-run`) that
encodes SHA-resolution + pre-flight and prints the exact `gh workflow run`
command. Kept as a runbook today to avoid a second thing that drifts from
`deploy.yml`.
