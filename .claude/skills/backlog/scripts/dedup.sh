#!/usr/bin/env bash
# dedup.sh — Phase 2 dedup helper for /backlog.
#
# Compares proposed findings against existing open issues (from discover.sh)
# and emits a dedup verdict per finding:
#   - "skip"          — exact dedup_key match in body (silent skip)
#   - "duplicate-of"  — fuzzy title match without our label (flag for user)
#   - "new"           — no overlap, propose normally
#
# Input: two JSON files
#   $1 = proposed findings (array of { title, dedup_key, category })
#   $2 = open issues from discover.sh (.open_issues field)
#
# Output: JSON array with verdict per finding, indexed in same order as input.
#
# Usage: ./dedup.sh <findings.json> <open_issues.json>

set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "Usage: $0 <findings.json> <open_issues.json>" >&2
  exit 2
fi

FINDINGS="$1"
OPEN_ISSUES="$2"

# Normalize title for fuzzy match: lowercase, strip punctuation, collapse whitespace
normalize() {
  echo "$1" | tr '[:upper:]' '[:lower:]' | tr -d '[:punct:]' | tr -s '[:space:]' ' ' | sed 's/^ *//; s/ *$//'
}

# Levenshtein-like ratio via python (already present per agent-os setup)
# Returns 1 if title_a vs title_b similarity >= threshold (default 0.85), else 0
fuzzy_match() {
  python3 -c "
import sys, difflib
a, b = sys.argv[1], sys.argv[2]
ratio = difflib.SequenceMatcher(None, a, b).ratio()
sys.exit(0 if ratio >= 0.85 else 1)
" "$1" "$2"
}

jq -c '.[]' "$FINDINGS" | while read -r finding; do
  title=$(echo "$finding" | jq -r '.title')
  dedup_key=$(echo "$finding" | jq -r '.dedup_key')
  norm_title=$(normalize "$title")

  verdict="new"
  dup_of=""

  # First pass: exact dedup_key match in open-issue bodies (silent skip)
  exact_match=$(jq -r --arg dk "$dedup_key" '
    .[] | select(.body != null) | select(.body | contains("Dedup key: `" + $dk + "`")) | .number
  ' "$OPEN_ISSUES" | head -1)

  if [[ -n "$exact_match" ]]; then
    verdict="skip"
    dup_of="$exact_match"
  else
    # Second pass: fuzzy title match (flag for user confirmation)
    while read -r issue; do
      [[ -z "$issue" ]] && continue
      issue_title=$(echo "$issue" | jq -r '.title')
      issue_num=$(echo "$issue" | jq -r '.number')
      norm_issue=$(normalize "$issue_title")
      if fuzzy_match "$norm_title" "$norm_issue"; then
        verdict="duplicate-of"
        dup_of="$issue_num"
        break
      fi
    done < <(jq -c '.[]' "$OPEN_ISSUES")
  fi

  jq -n \
    --arg title "$title" \
    --arg dedup_key "$dedup_key" \
    --arg verdict "$verdict" \
    --arg dup_of "$dup_of" \
    '{ title: $title, dedup_key: $dedup_key, verdict: $verdict, duplicate_of: ($dup_of | if . == "" then null else (. | tonumber) end) }'
done | jq -s '.'
