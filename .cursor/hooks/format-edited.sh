#!/bin/sh
INPUT=$(cat)
ROOT="${CURSOR_PROJECT_DIR:-.}"
FILE=$(printf '%s\n' "$INPUT" | sed -n 's/.*"file_path":"\([^"]*\)".*/\1/p')
[ -z "$FILE" ] && exit 0
case "$FILE" in
  "$ROOT"/*) ;;
  *) exit 0 ;;
esac
[ ! -f "$FILE" ] && exit 0
npx prettier --write "$FILE" >/dev/null 2>&1 || true
case "$FILE" in
  *.ts|*.tsx) npx eslint --fix -c eslint.config.js "$FILE" >/dev/null 2>&1 || true ;;
esac
exit 0
