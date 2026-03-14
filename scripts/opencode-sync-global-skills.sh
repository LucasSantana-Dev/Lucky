#!/usr/bin/env bash

set -euo pipefail

dest_root="${OPENCODE_GLOBAL_SKILLS_DIR:-$HOME/.opencode/skills}"
agents_dest="$dest_root/agents"
codex_dest="$dest_root/codex"
agents_src="$HOME/.agents/skills"
codex_src="$HOME/.codex/skills"

python3 - "$dest_root" "$agents_dest" "$codex_dest" <<'PY'
import pathlib
import shutil
import sys

root = pathlib.Path(sys.argv[1])
root.mkdir(parents=True, exist_ok=True)

for child in root.iterdir():
    if child.name in {"agents", "codex"}:
        continue
    if child.is_symlink() or child.is_file():
        child.unlink()
    elif child.is_dir():
        shutil.rmtree(child)

for raw in sys.argv[2:]:
    path = pathlib.Path(raw)
    path.mkdir(parents=True, exist_ok=True)
    for child in path.iterdir():
        if child.is_symlink() or child.is_file():
            child.unlink()
        elif child.is_dir():
            shutil.rmtree(child)
PY

relative_path() {
  python3 - "$1" "$2" <<'PY'
import os
import sys

print(os.path.relpath(sys.argv[2], sys.argv[1]))
PY
}

link_dir() {
  local dest_dir="$1"
  local source_dir="$2"
  local skill_name="$3"
  local target="$dest_dir/$skill_name"

  [[ -e "$target" ]] && return 0
  ln -s "$(relative_path "$dest_dir" "$source_dir")" "$target"
}

if [[ -d "$agents_src" ]]; then
  while IFS= read -r skill_dir; do
    link_dir "$agents_dest" "$skill_dir" "$(basename "$skill_dir")"
  done < <(find "$agents_src" -mindepth 1 -maxdepth 1 -type d -exec test -f '{}/SKILL.md' ';' -print | sort)
fi

if [[ -d "$codex_src" ]]; then
  while IFS= read -r skill_file; do
    skill_dir="$(dirname "$skill_file")"
    skill_name="$(basename "$skill_dir")"

    if [[ -e "$agents_dest/$skill_name" ]]; then
      continue
    fi

    link_dir "$codex_dest" "$skill_dir" "$skill_name"
  done < <(find "$codex_src" -name SKILL.md | sort)
fi
