#!/usr/bin/env bash
# Prints "true" when the diff BASE..HEAD is a pure release-please version bump,
# otherwise "false". Used by ci.yml (`changes` job) and e2e.yml to skip the
# heavy jobs on release PRs; the required checks still report (skipped counts
# as passing).
#
# Usage: scripts/ci/release-only.sh <base-commit> <head-commit>
#
# True only when ALL hold:
#   1. every changed file is in {package.json, package-lock.json,
#      CHANGELOG.md, .release-please-manifest.json}
#   2. root package.json is identical between BASE and HEAD once `.version`
#      is removed
#   3. package-lock.json is identical once `.version` and
#      `.packages[""].version` are removed
# Judged by content, never by branch name or author, so a dependency change
# riding in a release PR fails (2) or (3) and runs the full CI.
#
# Fails OPEN to full CI: any error (missing jq, bad JSON, git failure, empty
# diff) prints "false". Always exits 0; diagnostics go to stderr so command
# substitution captures only the verdict.
set -u

base=${1:-}
head=${2:-}

no() {
    echo "release-only: $1" >&2
    echo false
    exit 0
}

[ -n "$base" ] && [ -n "$head" ] || no "usage: release-only.sh <base> <head>"
command -v jq > /dev/null 2>&1 || no "jq not found"

changed=$(git diff --name-only "$base" "$head") || no "git diff failed"
[ -n "$changed" ] || no "empty diff"

while IFS= read -r f; do
    case "$f" in
        package.json | package-lock.json | CHANGELOG.md | .release-please-manifest.json) ;;
        *) no "non-release file changed: $f" ;;
    esac
done <<< "$changed"

# same_without <file> <jq-delete-expr>: 0 when base and head match after deletion.
same_without() {
    local file=$1 expr=$2 a b
    a=$(git show "$base:$file" | jq -S "$expr") || return 1
    b=$(git show "$head:$file" | jq -S "$expr") || return 1
    [ -n "$a" ] && [ "$a" = "$b" ]
}

if echo "$changed" | grep -qx 'package.json'; then
    same_without package.json 'del(.version)' || no "package.json differs beyond .version"
fi
if echo "$changed" | grep -qx 'package-lock.json'; then
    same_without package-lock.json 'del(.version) | del(.packages[""].version)' \
        || no "package-lock.json differs beyond root version"
fi

echo "release-only: version-bump-only diff, heavy jobs can skip" >&2
echo true
