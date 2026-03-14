#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dest_dir="$repo_root/.opencode/skills"

python3 - "$dest_dir" <<'PY'
import pathlib
import shutil
import sys

dest = pathlib.Path(sys.argv[1])
dest.mkdir(parents=True, exist_ok=True)

for child in dest.iterdir():
    if child.is_symlink() or child.is_file():
        child.unlink()
    elif child.is_dir():
        shutil.rmtree(child)
PY

link_skill() {
  local source_dir="$1"
  local skill_name="$2"
  local target="$dest_dir/$skill_name"

  if [[ -e "$target" ]]; then
    return 0
  fi

  local relative_target
  relative_target="$(python3 - "$dest_dir" "$source_dir" <<'PY'
import os
import sys

print(os.path.relpath(sys.argv[2], sys.argv[1]))
PY
)"

  ln -s "$relative_target" "$target"
}

for base_dir in "$repo_root/.cursor/skills" "$repo_root/.agent-skills"; do
  if [[ ! -d "$base_dir" ]]; then
    continue
  fi

  while IFS= read -r skill_dir; do
    link_skill "$skill_dir" "$(basename "$skill_dir")"
  done < <(find "$base_dir" -mindepth 1 -maxdepth 1 -type d -exec test -f '{}/SKILL.md' ';' -print | sort)
done
