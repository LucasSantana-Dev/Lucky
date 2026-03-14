#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
remote_host=""
attach_smoke=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --remote)
      remote_host="$2"
      shift 2
      ;;
    --attach-smoke)
      attach_smoke=1
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

verify_local() {
  cd "$repo_root"
  node --check .opencode/plugins/lucky-policy-lib.mjs
  node --check .opencode/plugins/lucky-policy.mjs
  node --check .opencode/plugins/lucky-context.mjs
  node --check .opencode/plugins/lucky-doc-reminders.mjs
  node --test .opencode/tests/lucky-policy.test.mjs
  opencode debug config >/dev/null
  opencode debug skill >/dev/null
  opencode mcp list >/dev/null
  opencode run --format json "Say only OK" >/dev/null
}

verify_remote() {
  local remote_dir="${OPENCODE_REMOTE_DIR:-/home/luk-server/Lucky}"
  ssh "$remote_host" "cd '$remote_dir' && ~/.opencode/bin/opencode debug config >/dev/null && ~/.opencode/bin/opencode debug skill >/dev/null && ~/.opencode/bin/opencode mcp list >/dev/null && ~/.opencode/bin/opencode run --format json 'Say only OK' >/dev/null"
}

attach_smoke_check() {
  python3 - <<'PY'
import os
import signal
import subprocess
import sys

repo_root = os.environ['REPO_ROOT']
cmd = [os.path.join(repo_root, 'scripts', 'opencode-attach-server-do-luk.sh')]
try:
    proc = subprocess.Popen(cmd, cwd=repo_root, start_new_session=True)
    proc.wait(timeout=10)
except subprocess.TimeoutExpired:
    os.killpg(proc.pid, signal.SIGTERM)
    try:
        proc.wait(timeout=2)
    except subprocess.TimeoutExpired:
        os.killpg(proc.pid, signal.SIGKILL)
    sys.exit(0)
PY
}

if [[ -n "$remote_host" ]]; then
  verify_remote
else
  verify_local
fi

if [[ $attach_smoke -eq 1 ]]; then
  export REPO_ROOT="$repo_root"
  attach_smoke_check
fi
