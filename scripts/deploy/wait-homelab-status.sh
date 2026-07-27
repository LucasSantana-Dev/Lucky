#!/usr/bin/env bash
set -euo pipefail

# Poll the homelab-deploy commit status for the deployed SHA.
# Extracted from deploy.yml, where this logic appeared twice.
#
# Modes:
#   validate  Wall-clock 10 minute deadline with HTTP health fallback. Used by
#             the "Validate deployed version" step when no Docker image rebuild
#             ran for the commit.
#   wait      12 fixed attempts. Used by "Wait for homelab deploy completion"
#             after an image rebuild; missing status or timeout only warn.
#
# Required env: EXPECTED_SHA, REPO, GH_TOKEN (used by gh).
# validate mode also requires HEALTH_URL.

mode="${1:-}"
case "$mode" in
    validate | wait) ;;
    *)
        echo "wait-homelab-status.sh: unknown mode '${mode}' (expected: validate|wait)" >&2
        exit 1
        ;;
esac

expected="${EXPECTED_SHA:?EXPECTED_SHA is required}"
repo="${REPO:?REPO is required}"

case "$mode" in
    validate)
        health_url="${HEALTH_URL:?HEALTH_URL is required in validate mode}"
        echo "==> No Docker rebuild - checking for homelab-deploy commit status (SHA: $expected)..."

        status_was_seen=false
        # Use wall-clock deadline instead of attempt counts to ensure
        # exactly 10 minutes of total polling time regardless of response latency.
        deadline=$(($(date +%s) + 600))
        attempt=0

        while [ "$(date +%s)" -lt "$deadline" ]; do
            attempt=$((attempt + 1))
            now=$(date +%s)
            remaining=$((deadline - now))
            echo "Attempt ${attempt} (${remaining}s remaining)..."
            deploy_state=$(timeout "$((remaining < 20 ? (remaining > 0 ? remaining : 1) : 20))" gh api \
                "repos/${repo}/commits/${expected}/statuses" \
                --jq '[.[] | select(.context == "homelab-deploy")] | first | .state // ""' \
                2>/dev/null || echo "")

            [ "$deploy_state" = "pending" ] && status_was_seen=true

            if [ "$deploy_state" = "success" ]; then
                echo "==> Homelab deploy completed successfully."
                exit 0
            fi
            if [ "$deploy_state" = "failure" ] || [ "$deploy_state" = "error" ]; then
                echo "::error::Homelab deploy reported failure - check deploy logs on homelab"
                exit 1
            fi

            if [ "$status_was_seen" = "false" ] && [ "$attempt" -eq 6 ]; then
                echo "::notice::No homelab-deploy status after ~90s - GITHUB_DEPLOY_STATUS_TOKEN not configured on homelab. Falling back to HTTP health check."
                http_attempt=0

                while [ "$(date +%s)" -lt "$deadline" ]; do
                    http_attempt=$((http_attempt + 1))
                    now=$(date +%s)
                    remaining=$((deadline - now))
                    echo "HTTP attempt ${http_attempt} (${remaining}s remaining)..."
                    response=$(curl -sS --max-time "$((remaining < 20 ? (remaining > 0 ? remaining : 1) : 20))" -w "\n%{http_code}" "$health_url" || true)
                    http_code=$(echo "$response" | tail -1)
                    if [ "$http_code" = "200" ]; then
                        echo "==> Service healthy. Done."
                        exit 0
                    fi
                    now=$(date +%s)
                    remaining=$((deadline - now))
                    [ "$remaining" -le 0 ] && break
                    sleep_for=$((remaining < 15 ? remaining : 15))
                    echo "Not ready (HTTP $http_code). Waiting ${sleep_for}s..."
                    sleep "$sleep_for"
                done
                echo "::error::Service did not become healthy before deadline"
                exit 1
            fi

            now=$(date +%s)
            remaining=$((deadline - now))
            [ "$remaining" -le 0 ] && break
            sleep_for=$((remaining < 15 ? remaining : 15))
            echo "Deploy status: ${deploy_state:-none}. Waiting ${sleep_for}s..."
            sleep "$sleep_for"
        done

        echo "::error::Deploy validation timed out"
        exit 1
        ;;
    wait)
        echo "==> Waiting for homelab deploy to complete (SHA: $expected)..."
        status_was_seen=false

        for attempt in $(seq 1 12); do
            echo "Attempt ${attempt}/12..."
            deploy_state=$(gh api \
                "repos/${repo}/commits/${expected}/statuses" \
                --jq '[.[] | select(.context == "homelab-deploy")] | first | .state // ""' \
                2>/dev/null || echo "")

            [ "$deploy_state" = "pending" ] && status_was_seen=true

            if [ "$deploy_state" = "success" ]; then
                echo "==> Homelab deploy completed successfully."
                exit 0
            fi
            if [ "$deploy_state" = "failure" ] || [ "$deploy_state" = "error" ]; then
                echo "::error::Homelab deploy reported failure after image deployment - check deploy logs on homelab"
                exit 1
            fi

            if [ "$status_was_seen" = "false" ] && [ "$attempt" -eq 6 ]; then
                echo "::warning::No homelab-deploy status after ~90s - GITHUB_DEPLOY_STATUS_TOKEN likely not configured on homelab. Cannot confirm full deploy completion."
                exit 0
            fi

            echo "Deploy status: ${deploy_state:-none}. Waiting 15s..."
            sleep 15
        done

        echo "::warning::Deploy completion timed out after 3 min - bot health gate may still be running. Check Discord notification for full outcome."
        ;;
esac
