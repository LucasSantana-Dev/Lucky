#!/usr/bin/env bash
# discover.sh — Phase 1 inline collectors for /backlog.
#
# Calls the heavyweight skills (audit-deep, ecosystem-health,
# repo-state-snapshot) are made via the Skill tool from the SKILL.md workflow,
# NOT from this script. This script only collects the lightweight inline
# signals (gh issue lists, git log, code markers) that feed Phase 2 dedup +
# evidence pool.
#
# Output: JSON on stdout with shape:
#   {
#     "open_issues": [{ "number": N, "title": "...", "labels": [...], "body": "..." }],
#     "closed_issues": [{ "number": N, "title": "...", "closedAt": "..." }],
#     "activity": { "commits_last_90d": N, "active_branches": [...] },
#     "code_markers": [{ "file": "path", "line": N, "marker": "TODO|FIXME|HACK|XXX", "text": "..." }]
#   }
#
# Usage: ./discover.sh [--max-markers 200] [--max-closed 100]

set -euo pipefail

MAX_MARKERS=200
MAX_CLOSED=100

while [[ $# -gt 0 ]]; do
  case "$1" in
    --max-markers) MAX_MARKERS="$2"; shift 2 ;;
    --max-closed)  MAX_CLOSED="$2";  shift 2 ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
done

# Verify we're in a repo with gh access
if ! git rev-parse --git-dir > /dev/null 2>&1; then
  echo '{"error": "not a git repo"}' && exit 0
fi

if ! gh auth status > /dev/null 2>&1; then
  GH_AVAILABLE=false
else
  GH_AVAILABLE=true
fi

# Open issues (for dedup)
if [[ "$GH_AVAILABLE" == "true" ]]; then
  OPEN_ISSUES=$(gh issue list --state open --limit 1000 --json number,title,labels,body 2>/dev/null || echo '[]')
  CLOSED_ISSUES=$(gh issue list --state closed --limit "$MAX_CLOSED" --json number,title,closedAt 2>/dev/null || echo '[]')
else
  OPEN_ISSUES='[]'
  CLOSED_ISSUES='[]'
fi

# Activity signal
COMMITS_90D=$(git log --oneline --since='90 days ago' 2>/dev/null | wc -l | tr -d ' ')
ACTIVE_BRANCHES=$(git for-each-ref --format='%(refname:short)' refs/heads/ --sort=-committerdate | head -10 | jq -R . | jq -s . 2>/dev/null || echo '[]')

# Code markers (read-only scan, respects .gitignore via git ls-files)
# Limit to source-file extensions to avoid scanning node_modules/dist/etc.
MARKERS=$(
  git ls-files '*.ts' '*.tsx' '*.js' '*.jsx' '*.py' '*.go' '*.rs' '*.java' '*.rb' '*.swift' '*.kt' 2>/dev/null \
    | head -2000 \
    | { xargs -I{} grep -HnE '\b(TODO|FIXME|HACK|XXX)\b' {} 2>/dev/null || true; } \
    | head -n "$MAX_MARKERS" \
    | jq -Rsn '
        [inputs | split("\n") | .[] | select(length > 0) | capture("^(?<file>[^:]+):(?<line>[0-9]+):(?<text>.*\\b(?<marker>TODO|FIXME|HACK|XXX)\\b.*)$")]
      ' 2>/dev/null || echo '[]'
)

jq -n \
  --argjson open "$OPEN_ISSUES" \
  --argjson closed "$CLOSED_ISSUES" \
  --argjson commits "$COMMITS_90D" \
  --argjson branches "$ACTIVE_BRANCHES" \
  --argjson markers "$MARKERS" \
  --arg gh_available "$GH_AVAILABLE" \
  '{
    open_issues: $open,
    closed_issues: $closed,
    activity: { commits_last_90d: $commits, active_branches: $branches },
    code_markers: $markers,
    gh_available: ($gh_available == "true")
  }'
