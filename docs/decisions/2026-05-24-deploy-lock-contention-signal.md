# ADR: Deploy Lock Contention — Fail Fast with Error Commit Status

**Date:** 2026-05-24  
**Status:** Accepted

## Context

`deploy.sh` uses an atomic `mkdir` lock (`$LOCK_DIR`) to prevent concurrent deploys. When a second webhook fires while a deploy is already running, `acquire_lock` fails and `deploy.sh` exits 1 immediately.

Before this change, the contention path had two problems:

1. `DEPLOYED_SHA` is set only after `sync_checkout_to_origin_main` succeeds, so the EXIT trap's `post_deploy_status` call had no SHA to post against — the status was silently dropped.
2. CI polled the `homelab-deploy` commit status for the incoming SHA for up to 5 minutes (20 × 15s), found nothing, and printed "Deploy validation timed out" with exit 1 — giving a confusing signal rather than an actionable one.

The second commit's deploy was silently dropped; an operator had to dig through deploy logs to understand why.

## Decision

Before the lock acquisition attempt, run `git fetch origin main` to determine the incoming SHA regardless of what the working tree contains. On contention, immediately post `state: error` keyed to that SHA via the GitHub Statuses API — then exit 1.

```bash
incoming_sha=""
if git -C "$DEPLOY_DIR" fetch origin main 2>/dev/null; then
    incoming_sha=$(git -C "$DEPLOY_DIR" rev-parse FETCH_HEAD 2>/dev/null || true)
fi

if ! acquire_lock; then
    if [[ -n "$GITHUB_DEPLOY_STATUS_TOKEN" && -n "$incoming_sha" ]]; then
        curl -s -o /dev/null \
            -X POST \
            -H "Authorization: token $GITHUB_DEPLOY_STATUS_TOKEN" \
            -H "Content-Type: application/json" \
            "https://api.github.com/repos/${GITHUB_REPO}/statuses/${incoming_sha}" \
            -d '{"state":"error","description":"Deploy skipped — another deploy in progress","context":"homelab-deploy"}' || true
    fi
    notify 16711680 "Deploy Skipped" "Another deploy is already in progress"
    exit 1
fi
```

The `git fetch` result is silently swallowed if the network is unavailable — `incoming_sha` stays empty and the status post is skipped (same behavior as missing token).

## Alternatives Considered

**Keep exit-1 with no status post:** Zero change, CI continues to time out confusingly after 5 minutes. Rejected — the root cause (concurrent deploy) is immediately knowable; masking it costs operator time.

**Post `failure` instead of `error`:** `failure` implies the deploy ran and the service is broken. `error` means the deploy could not start — the correct semantic per the GitHub Statuses API. Operator sees "error" in the deploy check and knows to look at lock contention, not service health.

**Wait for the running deploy to finish, then re-trigger:** Requires a retry loop inside deploy.sh and a way to re-webhook the same SHA. Over-engineered for the frequency of occurrence. The operator can re-push or re-trigger if needed.

**Extend EXIT trap to capture incoming SHA:** The EXIT trap fires after lock failure too, but `DEPLOYED_SHA` is empty at that point. Patching the trap to use `incoming_sha` would work but is more invasive and less readable than the targeted pre-lock block.

## Consequences

**Positive:**

- CI exits immediately on `error` status instead of timing out after 5 minutes.
- The error description ("Deploy skipped — another deploy in progress") is surfaced directly in the CI step output via `gh api` polling.
- The operator can re-trigger the second deploy after the first finishes.

**Negative:**

- `git fetch origin main` adds one network call before every deploy, including the common non-contention path. The call is a `fetch` (read-only, ~100ms on LAN), not a full clone. A fetch failure is silently ignored and does not abort the deploy.
- If both `GITHUB_DEPLOY_STATUS_TOKEN` is absent and the fetch fails, the error is invisible to CI — same as before this change. The token must be configured for full benefit.

**Neutral:**

- The same `homelab-deploy` context string is used, so the error status appears on the same row as the success/failure status in the GitHub UI.

## Revisit When

- Rapid-fire deploys (>2 concurrent) become common — the lock pattern itself may need a queue rather than a drop.
- `git fetch` latency from homelab to GitHub increases consistently beyond ~2s (measure via deploy logs).
- `GITHUB_DEPLOY_STATUS_TOKEN` is rotated without updating the homelab environment — contention will revert to silent CI timeout until the token is refreshed.
