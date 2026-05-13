#!/usr/bin/env bash
set -euo pipefail

# Verify the active release/vX.Y.Z branch is at-or-ahead-of main.
# Exits 1 with a remediation message if the invariant is violated.

git fetch origin --quiet
active=$(git ls-remote --heads origin 'refs/heads/release/v*' | awk -F'refs/heads/' '{print $2}' | sort -V | tail -1)
if [ -z "$active" ]; then
  echo "No release/v* branch; nothing to check"
  exit 0
fi

if git merge-base --is-ancestor "origin/main" "origin/$active"; then
  echo "✓ $active is at-or-ahead-of main"
  exit 0
fi

behind=$(git rev-list --count "origin/$active..origin/main")
echo "✗ $active is BEHIND main by $behind commit(s)"
echo ""
echo "To fix:"
echo "  git switch -c sync-$active origin/$active"
echo "  git merge origin/main --ff-only || git merge origin/main"
echo "  git push origin HEAD:$active"
exit 1
