#!/usr/bin/env bash

set -euo pipefail

remote_host=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --remote)
      remote_host="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

install_local() {
  local config_dir="${OPENCODE_HOST_CONFIG_DIR:-$HOME/.config/opencode}"
  local opencode_bin="${OPENCODE_LOCAL_BIN:-$HOME/.opencode/bin/opencode}"
  local model="${OPENCODE_PLUGIN_MODEL:-openai/gpt-5.3-codex}"

  mkdir -p "$config_dir"

  if command -v bun >/dev/null 2>&1; then
    if [[ ! -f "$config_dir/package.json" ]]; then
      cat > "$config_dir/package.json" <<'JSON'
{
  "name": "opencode-local-config",
  "private": true
}
JSON
    fi
    (cd "$config_dir" && bun add @tarquinen/opencode-dcp@latest >/dev/null)
  fi

  local temp_config
  local temp_project
  temp_config="$(mktemp -d)"
  temp_project="$(mktemp -d)"

  cat > "$temp_config/opencode.jsonc" <<JSON
{
  "\$schema": "https://opencode.ai/config.json",
  "model": "$model",
  "plugin": [
    "opencode-shell-strategy",
    "@tarquinen/opencode-dcp@latest"
  ]
}
JSON

  (
    cd "$temp_project"
    OPENCODE_CONFIG_DIR="$temp_config" "$opencode_bin" run --format json "Say only OK" >/dev/null
  )

  rm -rf "$temp_config" "$temp_project"
}

if [[ -n "$remote_host" ]]; then
  ssh "$remote_host" 'bash -s' <<'EOF_REMOTE'
set -euo pipefail
export OPENCODE_HOST_CONFIG_DIR="${OPENCODE_HOST_CONFIG_DIR:-$HOME/.config/opencode}"
export OPENCODE_LOCAL_BIN="${OPENCODE_LOCAL_BIN:-$HOME/.opencode/bin/opencode}"
export OPENCODE_PLUGIN_MODEL="${OPENCODE_PLUGIN_MODEL:-openai/gpt-5.3-codex}"

mkdir -p "$OPENCODE_HOST_CONFIG_DIR"

if command -v bun >/dev/null 2>&1; then
  if [[ ! -f "$OPENCODE_HOST_CONFIG_DIR/package.json" ]]; then
    cat > "$OPENCODE_HOST_CONFIG_DIR/package.json" <<'JSON'
{
  "name": "opencode-local-config",
  "private": true
}
JSON
  fi
  (cd "$OPENCODE_HOST_CONFIG_DIR" && bun add @tarquinen/opencode-dcp@latest >/dev/null)
fi

temp_config="$(mktemp -d)"
temp_project="$(mktemp -d)"

cat > "$temp_config/opencode.jsonc" <<JSON
{
  "\$schema": "https://opencode.ai/config.json",
  "model": "$OPENCODE_PLUGIN_MODEL",
  "plugin": [
    "opencode-shell-strategy",
    "@tarquinen/opencode-dcp@latest"
  ]
}
JSON

(
  cd "$temp_project"
  OPENCODE_CONFIG_DIR="$temp_config" "$OPENCODE_LOCAL_BIN" run --format json "Say only OK" >/dev/null
)

rm -rf "$temp_config" "$temp_project"
EOF_REMOTE
  exit 0
fi

install_local
