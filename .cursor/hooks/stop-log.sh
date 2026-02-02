#!/bin/sh
INPUT=$(cat)
ROOT="${CURSOR_PROJECT_DIR:-.}"
LOG="$ROOT/.cursor/hooks.log"
STATUS=$(printf '%s\n' "$INPUT" | sed -n 's/.*"status":"\([^"]*\)".*/\1/p')
LOOP=$(printf '%s\n' "$INPUT" | sed -n 's/.*"loop_count":\([0-9]*\).*/\1/p')
TS=$(date -Iseconds 2>/dev/null || date '+%Y-%m-%dT%H:%M:%S%z')
printf '%s status=%s loop_count=%s\n' "$TS" "$STATUS" "$LOOP" >> "$LOG" 2>/dev/null || true
exit 0
