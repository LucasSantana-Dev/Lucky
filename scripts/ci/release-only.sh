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
#   2. BOTH package.json and package-lock.json are in the changed set. A
#      CHANGELOG-only or manifest-only diff is not a release and returns
#      false (CHANGELOG.md is baked into the frontend image, so the frontend
#      build must still run for it)
#   3. root package.json is identical between BASE and HEAD once `.version`
#      is removed
#   4. package-lock.json is identical once `.version` and
#      `.packages[""].version` are removed
#   5. at HEAD the versions agree: package.json `.version` == package-lock
#      `.version` == package-lock `.packages[""].version` == manifest `["."]`
#      (manifest checked when present at HEAD)
# Judged by content, never by branch name or author, so a dependency change
# riding in a release PR fails (3) or (4) and runs the full CI.
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

echo "$changed" | grep -qx 'package.json' || no "package.json not in diff"
echo "$changed" | grep -qx 'package-lock.json' || no "package-lock.json not in diff"

same_without package.json 'del(.version)' || no "package.json differs beyond .version"
same_without package-lock.json 'del(.version) | del(.packages[""].version)' \
    || no "package-lock.json differs beyond root version"

pkg_v=$(git show "$head:package.json" | jq -er '.version') || no "package.json has no version"
lock_v=$(git show "$head:package-lock.json" | jq -er '.version') || no "lock has no version"
lock_root_v=$(git show "$head:package-lock.json" | jq -er '.packages[""].version') \
    || no "lock has no root package version"
[ "$pkg_v" = "$lock_v" ] && [ "$pkg_v" = "$lock_root_v" ] || no "version mismatch across package files"
if git cat-file -e "$head:.release-please-manifest.json" 2> /dev/null; then
    man_v=$(git show "$head:.release-please-manifest.json" | jq -er '.["."]') || no "manifest has no root version"
    [ "$pkg_v" = "$man_v" ] || no "manifest version differs from package.json"
fi

echo "release-only: version-bump-only diff, heavy jobs can skip" >&2
echo true
