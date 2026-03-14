#!/usr/bin/env bash

set -euo pipefail

remote_host="${1:-server-do-luk}"
remote_dir="${OPENCODE_REMOTE_DIR:-/home/luk-server/Lucky}"
remote_serve_cmd="${OPENCODE_REMOTE_SERVE_CMD:-\$HOME/.local/bin/opencode-lucky-serve}"
remote_port="${OPENCODE_REMOTE_PORT:-4096}"
local_port="${OPENCODE_LOCAL_PORT:-4096}"
local_bin="${OPENCODE_LOCAL_BIN:-$HOME/.opencode/bin/opencode}"
ssh_args=(
  -o ExitOnForwardFailure=yes
  -o ServerAliveInterval=30
  -o ServerAliveCountMax=3
)

ssh "$remote_host" "bash -lc '
  set -euo pipefail
  if [[ ! -x $remote_serve_cmd ]]; then
    echo \"Missing OpenCode serve helper at $remote_serve_cmd\" >&2
    exit 1
  fi
  if ! ss -ltnH | awk '\''{print \$4}'\'' | grep -qx \"127.0.0.1:$remote_port\"; then
    mkdir -p \"\$HOME/.local/share/opencode\"
    nohup $remote_serve_cmd \
      >\"\$HOME/.local/share/opencode/lucky-serve.log\" 2>&1 &
    for _ in 1 2 3 4 5; do
      sleep 1
      if ss -ltnH | awk '\''{print \$4}'\'' | grep -qx \"127.0.0.1:$remote_port\"; then
        break
      fi
    done
  fi
  if ! ss -ltnH | awk '\''{print \$4}'\'' | grep -qx \"127.0.0.1:$remote_port\"; then
    echo \"OpenCode server did not start on 127.0.0.1:$remote_port\" >&2
    exit 1
  fi
'"

ssh "${ssh_args[@]}" -N -L "${local_port}:127.0.0.1:${remote_port}" "$remote_host" &
tunnel_pid=$!

cleanup() {
  if kill -0 "$tunnel_pid" >/dev/null 2>&1; then
    kill "$tunnel_pid"
    wait "$tunnel_pid" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

sleep 1
"$local_bin" attach "http://127.0.0.1:${local_port}" --dir "$remote_dir"
