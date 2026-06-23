#!/bin/bash
# Async wrapper for deploy-staging.sh — returns immediately while the staging
# deploy runs detached, so the triggering curl never blocks on the build.
# Mirrors deploy-wrapper.sh but targets the staging stack.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEPLOY_SCRIPT="$SCRIPT_DIR/deploy-staging.sh"
LOG_FILE="/tmp/lucky-staging-deploy.log"

if [[ ! -x "$DEPLOY_SCRIPT" ]]; then
    echo "[deploy-staging-wrapper] ERROR: $DEPLOY_SCRIPT is not executable"
    exit 1
fi

nohup bash "$DEPLOY_SCRIPT" "$@" > "$LOG_FILE" 2>&1 &
echo "[deploy-staging-wrapper] Staging deploy started (pid=$!, log=$LOG_FILE)"
