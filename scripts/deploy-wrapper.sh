#!/bin/bash
# Async wrapper for deploy.sh — returns immediately while deploy runs in background.
# The almir/webhook binary blocks until the execute-command completes; this wrapper
# exits in <1s so the CI curl never times out, while the real deploy.sh runs detached.
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-/repo}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEPLOY_SCRIPT="$SCRIPT_DIR/deploy.sh"
LOG_FILE="/tmp/lucky-deploy.log"

if [[ ! -x "$DEPLOY_SCRIPT" ]]; then
    echo "[deploy-wrapper] ERROR: $DEPLOY_SCRIPT is not executable"
    exit 1
fi

# Launch the real deploy detached from this process.
# stdout/stderr go to a log file so webhook doesn't try to capture them.
nohup bash "$DEPLOY_SCRIPT" "$@" > "$LOG_FILE" 2>&1 &
DEPLOY_PID=$!

echo "[deploy-wrapper] Deploy started (pid=$DEPLOY_PID, log=$LOG_FILE)"
