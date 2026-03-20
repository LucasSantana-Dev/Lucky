#!/usr/bin/env bash
set -euo pipefail

mode="${1:-show}"
case "${mode}" in
show | json | --json) ;;
*)
  echo "usage: check-path-portability.sh [show|json|--json]" >&2
  exit 1
  ;;
esac

json_mode=false
if [[ "${mode}" == "json" || "${mode}" == "--json" ]]; then
  json_mode=true
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "${script_dir}/.." && pwd)"
repo_name="$(basename "${repo_root}")"
parent_name="$(basename "$(dirname "${repo_root}")")"

legacy_root=""
legacy_home=""
if [[ "${parent_name}" == "forge-space" ]]; then
  legacy_root="${HOME}/Desenvolvimento/forge-space/${repo_name}"
  legacy_home="\$HOME/Desenvolvimento/forge-space/${repo_name}"
else
  legacy_root="${HOME}/Desenvolvimento/${repo_name}"
  legacy_home="\$HOME/Desenvolvimento/${repo_name}"
fi

issues=()
tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT
issue_details_file="${tmp_dir}/issue-details.json"
printf '%s\n' '[]' > "${issue_details_file}"

append_issue_detail() {
  local code="$1"
  local source="$2"
  local severity="$3"
  local message="$4"
  local expected_json="${5:-null}"
  local actual_json="${6:-null}"
  local tmp_issue_details
  tmp_issue_details="$(mktemp "${issue_details_file}.XXXXXX")"
  jq \
    --arg code "${code}" \
    --arg source "${source}" \
    --arg severity "${severity}" \
    --arg message "${message}" \
    --argjson expected "${expected_json}" \
    --argjson actual "${actual_json}" \
    '. + [{
      code: $code,
      source: $source,
      severity: $severity,
      message: $message,
      expected: $expected,
      actual: $actual
    }]' \
    "${issue_details_file}" > "${tmp_issue_details}"
  mv "${tmp_issue_details}" "${issue_details_file}"
}

record_issue() {
  local code="$1"
  local source="$2"
  local severity="${3:-high}"
  local message="${4:-$1:$2}"
  local expected_json="${5:-null}"
  local actual_json="${6:-null}"
  issues+=("${message}")
  append_issue_detail "${code}" "${source}" "${severity}" "${message}" \
    "${expected_json}" "${actual_json}"
}

check_pattern_absent() {
  local pattern="$1"
  local code="$2"
  local expected_text="$3"
  local hits_file="${tmp_dir}/${code}.hits"
  local rc=0
  local expected_json=""
  local actual_json=""

  rg -n --hidden \
    --glob '!**/.git/**' \
    --glob '!**/.worktrees/**' \
    --glob '!**/node_modules/**' \
    --glob '!**/dist/**' \
    --glob '!**/build/**' \
    --glob '!**/.next/**' \
    --glob '!**/.cache/**' \
    --glob '!**/.tmp/**' \
    --glob '!**/tmp/**' \
    --glob '!**/coverage/**' \
    --glob '!**/.venv/**' \
    --glob '!**/venv/**' \
    --glob '!**/data/ide-backups/**' \
    --glob '!**/*.lock' \
    --glob '!**/package-lock.json' \
    --glob '!**/pnpm-lock.yaml' \
    --glob '!**/yarn.lock' \
    --glob '!**/.DS_Store' \
    --glob '!**/scripts/check-path-portability.sh' \
    --glob '!**/.github/workflows/path-portability.yml' \
    --fixed-strings -- "${pattern}" "${repo_root}" > "${hits_file}" || rc=$?

  if [[ "${rc}" -ge 2 ]]; then
    echo "ripgrep failed while scanning pattern: ${code}" >&2
    exit "${rc}"
  fi

  if [[ -s "${hits_file}" ]]; then
    expected_json="$(jq -Rn --arg value "${expected_text}" '$value')"
    actual_json="$(jq -Rsc 'split("\n") | map(select(length > 0))' < "${hits_file}")"
    record_issue "${code}" "${repo_root}" "high" "portability:${code}" \
      "${expected_json}" "${actual_json}"
    if [[ "${json_mode}" != "true" ]]; then
      printf 'portability drift: %s\n' "${code}"
      sed 's/^/  - /' "${hits_file}"
    fi
  fi
}

check_pattern_absent "${legacy_root}" \
  "hardcoded_legacy_repo_path" \
  "Use repo-relative paths, \$PWD, or environment-driven project roots"
check_pattern_absent "${legacy_home}" \
  "hardcoded_home_repo_path" \
  "Use repo-relative paths, \$PWD, or environment-driven project roots"

if [[ "${#issues[@]}" -gt 0 ]]; then
  if [[ "${json_mode}" == "true" ]]; then
    issues_json="$(
      printf '%s\n' "${issues[@]}" | jq -Rsc 'split("\n") | map(select(length > 0))'
    )"
    issue_details_json="$(cat "${issue_details_file}")"
    jq -n \
      --arg status "drift" \
      --argjson issues "${issues_json}" \
      --argjson issue_details "${issue_details_json}" \
      '{
        status: $status,
        driftDetected: true,
        issueCount: ($issues | length),
        issues: $issues,
        issueDetails: $issue_details
      }'
  fi
  exit 1
fi

if [[ "${json_mode}" == "true" ]]; then
  jq -n '{
    status: "ok",
    driftDetected: false,
    issueCount: 0,
    issues: [],
    issueDetails: []
  }'
  exit 0
fi

echo "path portability aligned"
