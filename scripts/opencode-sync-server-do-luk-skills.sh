#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
remote_host="${1:-server-do-luk}"
remote_opencode_dir="/home/luk-server/.opencode/skills"

"$repo_root/scripts/opencode-sync-global-skills.sh"
"$repo_root/scripts/opencode-sync-project-skills.sh"

ssh "$remote_host" "mkdir -p '$remote_opencode_dir/agents' '$remote_opencode_dir/codex'"

rsync -aL --delete "$HOME/.opencode/skills/agents/" \
  "$remote_host:$remote_opencode_dir/agents/"

rsync -aL --delete "$HOME/.opencode/skills/codex/" \
  "$remote_host:$remote_opencode_dir/codex/"
