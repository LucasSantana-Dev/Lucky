#!/usr/bin/env bash
set -euo pipefail

# Annotate a failed deploy run with what production is ACTUALLY running.
# A failed deploy that auto-rolled back must not read like a generic red
# check (#1892): state whether the rollback restored service on an older
# SHA and which SHA production serves now.
#
# Required env: WEBHOOK_URL, EXPECTED_SHA, REPO, GH_TOKEN (used by gh).
# Optional env: RELEASE_TAG (release tag that triggered the deploy, if any).

expected="${EXPECTED_SHA:?EXPECTED_SHA is required}"
repo="${REPO:?REPO is required}"
webhook_url="${WEBHOOK_URL:?WEBHOOK_URL is required}"
tag_label="${RELEASE_TAG:-no release tag}"

base_url=$(bash "$(dirname "$0")/derive-webhook-origin.sh" "$webhook_url")

actual=$(curl -sS --max-time 15 "${base_url}/api/health/version" 2>/dev/null \
    | node -e '
        let d=""; process.stdin.on("data",c=>d+=c);
        process.stdin.on("end",()=>{
          try { const p=JSON.parse(d); console.log(p.commitSha ?? ""); }
          catch { console.log(""); }
        })' || true)

if [ -z "$actual" ]; then
    echo "::error::Deploy failed and the running production SHA could not be determined (health endpoint unreachable). Check the homelab deploy log (/tmp/lucky-deploy.log) for a possible auto-rollback."
    exit 0
fi

if [ "$actual" = "$expected" ]; then
    echo "::error::Deploy workflow failed AFTER the rollout: production is running the expected SHA $actual ($tag_label). The failure is in a post-deploy check, not the deploy itself."
    exit 0
fi

# Production serves a different SHA than the one this run tried to deploy:
# the homelab auto-rollback restored service on the last-good SHA. Say so
# explicitly, and flag when that SHA is strictly older than the release
# that triggered this deploy (a strictly worse state than never deploying).
echo "::error::DEPLOY FAILED: auto-rollback restored service on $actual. Production is running $actual, NOT the deployed target $expected ($tag_label)."

compare=$(gh api "repos/${repo}/compare/${actual}...${expected}" \
    --jq '"\(.ahead_by) \(.behind_by)"' 2>/dev/null || echo "")
ahead=$(echo "$compare" | awk '{print $1}')
behind=$(echo "$compare" | awk '{print $2}')

if [ -n "$ahead" ] && [ "$behind" = "0" ] && [ "$ahead" -gt 0 ]; then
    echo "::error::PRODUCTION IS BEHIND THE RELEASE: $actual is $ahead commit(s) older than $expected ($tag_label). main has fixes production does not. Investigate the rollback cause and redeploy."
fi
