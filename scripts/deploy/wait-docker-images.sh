#!/usr/bin/env bash
set -euo pipefail

# Wait until the deploy SHA's images exist in ghcr, then return, even if the
# docker-publish run is still busy with Trivy, SARIF upload, the yt-dlp smoke
# test, cache export and buildx post steps. Those still run and still alert;
# they no longer gate the rollout (owner decision 2026-10-08).
#
# While polling it also watches the docker-publish run: if the run concludes
# anything but success before every manifest exists, the deploy aborts.
#
# Required env:
#   RUN_ID       docker-publish run id for the deploy SHA
#   COMMIT_SHA   full deploy commit SHA
#   REPO         owner/name (GitHub repository), used for `gh run view`
#   IMAGE_PREFIX ghcr image prefix, lowercase (e.g. ghcr.io/owner/lucky)
#   GH_TOKEN     used by gh
# Optional env:
#   MAX_WAIT (default 1800), INTERVAL (default 10)
#   SERVICES (default "bot backend frontend nginx render")
#
# Tag format: docker/metadata-action `type=sha,prefix=` in docker-publish.yml
# pushes the 7-char short SHA, and scripts/deploy.sh pulls ${DEPLOY_SHA:0:7}.
# KEEP IN SYNC with both.
#
# Exit: 0 images ready, 1 abort or timeout.

run_id="${RUN_ID:?RUN_ID is required}"
commit_sha="${COMMIT_SHA:?COMMIT_SHA is required}"
repo="${REPO:?REPO is required}"
image_prefix="${IMAGE_PREFIX:?IMAGE_PREFIX is required}"
max_wait="${MAX_WAIT:-1800}"
interval="${INTERVAL:-10}"
services="${SERVICES:-bot backend frontend nginx render}"
tag="${commit_sha:0:7}"

# Sets manifest_missing (space-separated services without a manifest yet).
# Returns 0 when all exist, 1 when some are missing, 2 when the registry
# refused us (auth/permission), so the caller can fall back to the old
# whole-run wait instead of timing out on a check that can never succeed.
check_manifests() {
  manifest_missing=""
  local svc out
  for svc in $services; do
    if out=$(docker manifest inspect "${image_prefix}-${svc}:${tag}" 2>&1); then
      continue
    fi
    if printf '%s' "$out" | grep -Eqi 'unauthorized|denied|forbidden|authentication required'; then
      echo "  registry refused ${image_prefix}-${svc}:${tag}: $(printf '%s' "$out" | head -1)"
      return 2
    fi
    manifest_missing="${manifest_missing:+$manifest_missing }$svc"
  done
  [ -z "$manifest_missing" ]
}

run_state() {
  gh run view "$run_id" --repo "$repo" --json status,conclusion \
    --jq '"\(.status) \(.conclusion)"' 2>/dev/null || true
}

echo "==> Waiting for ${image_prefix}-{${services// /,}}:${tag} (docker-publish run ${run_id}, max ${max_wait}s)"

start=$(date +%s)
deadline=$((start + max_wait))
registry_blind=false

while true; do
  elapsed=$(($(date +%s) - start))
  rc=0
  check_manifests || rc=$?

  if [ "$rc" -eq 0 ]; then
    echo "==> All images for ${tag} exist in the registry (${elapsed}s). Deploying without waiting for Trivy/smoke/cache export."
    exit 0
  fi
  if [ "$rc" -eq 2 ] && [ "$registry_blind" = false ]; then
    registry_blind=true
    echo "::warning::Cannot read ghcr manifests with this token; falling back to waiting for the whole docker-publish run."
  fi

  state=$(run_state)
  status=$(printf '%s' "$state" | awk '{print $1}')
  conclusion=$(printf '%s' "$state" | awk '{print $2}')
  if [ "$rc" -eq 2 ]; then
    echo "  docker-publish: ${status:-unknown} (${elapsed}s elapsed), registry unreadable"
  else
    echo "  docker-publish: ${status:-unknown}, missing: ${manifest_missing} (${elapsed}s elapsed)"
  fi

  if [ "$status" = "completed" ]; then
    if [ "$conclusion" != "success" ]; then
      echo "::error::docker-publish ended (conclusion=${conclusion}) before all images existed (missing: ${manifest_missing:-unknown}), aborting deploy"
      exit 1
    fi
    if [ "$rc" -eq 2 ]; then
      echo "==> docker-publish succeeded (registry unreadable, trusting the run)."
      exit 0
    fi
    # Run succeeded but a manifest is still absent: allow one registry
    # propagation retry, then fail rather than deploy a missing image.
    sleep "$interval"
    rc=0
    check_manifests || rc=$?
    if [ "$rc" -eq 0 ]; then
      echo "==> All images for ${tag} exist in the registry."
      exit 0
    fi
    echo "::error::docker-publish succeeded but images are missing for ${tag}: ${manifest_missing:-unknown}"
    exit 1
  fi

  if [ "$(date +%s)" -ge "$deadline" ]; then
    echo "::error::Timed out waiting for Docker images after ${max_wait}s (missing: ${manifest_missing:-unknown})"
    exit 1
  fi
  sleep "$interval"
done
