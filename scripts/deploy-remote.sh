#!/bin/bash
set -euo pipefail

WORKFLOW_FILE="${WORKFLOW_FILE:-deploy.yml}"
REF="${1:-main}"

if ! command -v gh >/dev/null 2>&1; then
    echo "gh CLI is required"
    exit 1
fi

echo "Triggering '$WORKFLOW_FILE' on ref '$REF'..."
run_output="$(gh workflow run "$WORKFLOW_FILE" --ref "$REF" 2>&1)"
echo "$run_output"

run_id="$(echo "$run_output" | sed -nE 's#.*actions/runs/([0-9]+).*#\1#p' | tail -1)"

if [ -z "$run_id" ]; then
    for _ in $(seq 1 20); do
        run_id="$(gh run list \
            --workflow "$WORKFLOW_FILE" \
            --event workflow_dispatch \
            --branch "$REF" \
            --limit 1 \
            --json databaseId \
            --jq '.[0].databaseId' 2>/dev/null || true)"
        [ -n "$run_id" ] && break
        sleep 2
    done
fi

if [ -z "$run_id" ]; then
    echo "Failed to get run id"
    exit 1
fi

echo "Watching run: $run_id"
set +e
gh run watch "$run_id" --exit-status
status=$?
set -e
if [ "$status" -ne 0 ]; then
    gh run view "$run_id" --log-failed || true
    exit "$status"
fi
