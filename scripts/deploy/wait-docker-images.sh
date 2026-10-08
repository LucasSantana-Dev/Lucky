#!/usr/bin/env bash
set -euo pipefail

# Wait until the deploy SHA's images exist in ghcr and the bot image's ESM load
# check passed, then return, even if the docker-publish run is still busy with
# Trivy, SARIF upload, the yt-dlp smoke test, cache export and buildx post
# steps. Those still run and still alert; they no longer gate the rollout
# (owner decision 2026-10-08). The "Verify ESM module load" step does keep
# gating: it was added after the broken 2.36.0 deploy (#1854).
#
# Every loop it reads the docker-publish run first: a run that is `completed`
# with anything but success aborts the deploy even when all images exist
# (smoke failed after push, or a re-run whose earlier attempt left images).
# An unreadable run state never allows success: it keeps polling and fails
# closed at the deadline. The run is read once more right before any success
# exit. Every external call is capped by `timeout`, and sleeps by the time
# left, so MAX_WAIT is honored.
#
# Required env:
#   RUN_ID       docker-publish run id for the deploy SHA
#   COMMIT_SHA   full deploy commit SHA
#   REPO         owner/name (GitHub repository), used for gh
#   IMAGE_PREFIX ghcr image prefix, lowercase (e.g. ghcr.io/owner/lucky)
#   GH_TOKEN     used by gh
# Optional env:
#   MAX_WAIT (default 1800), INTERVAL (default 10), CALL_TIMEOUT (default 30)
#   SERVICES (default "bot backend frontend nginx render")
#
# Tag format: docker/metadata-action `type=sha,prefix=` in docker-publish.yml
# pushes the 7-char short SHA, and scripts/deploy.sh pulls ${DEPLOY_SHA:0:7}.
# The bot image carries org.opencontainers.image.revision (metadata-action
# label) = full SHA, compared against COMMIT_SHA to catch short-SHA collisions.
# KEEP IN SYNC with docker-publish.yml.
#
# Exit: 0 images ready, 1 abort or timeout.

run_id="${RUN_ID:?RUN_ID is required}"
commit_sha="${COMMIT_SHA:?COMMIT_SHA is required}"
repo="${REPO:?REPO is required}"
image_prefix="${IMAGE_PREFIX:?IMAGE_PREFIX is required}"
max_wait="${MAX_WAIT:-1800}"
interval="${INTERVAL:-10}"
call_cap="${CALL_TIMEOUT:-30}"
services="${SERVICES:-bot backend frontend nginx render}"
tag="${commit_sha:0:7}"
esm_step_prefix="Verify ESM module load"

logged_errors=" "
label_warned=false
manifest_missing=""
esm=""

start=$(date +%s)
deadline=$((start + max_wait))

remaining() { echo $((deadline - $(date +%s))); }

# Per-call cap: min(call_cap, time left), never below 1s.
call_timeout() {
  local left
  left=$(remaining)
  if [ "$left" -gt "$call_cap" ]; then
    echo "$call_cap"
  elif [ "$left" -lt 1 ]; then
    echo 1
  else
    echo "$left"
  fi
}

# Sets manifest_missing (space-separated services without a usable manifest).
# Returns 0 when all exist, 1 when some are missing, 2 when the registry
# refused us (auth/permission), so the caller can fall back to the old
# whole-run wait instead of timing out on a check that can never succeed.
check_manifests() {
  manifest_missing=""
  local svc ref out crc ct
  for svc in $services; do
    if [ "$(remaining)" -le 0 ]; then
      manifest_missing="${manifest_missing:+$manifest_missing }$svc"
      continue
    fi
    ref="${image_prefix}-${svc}:${tag}"
    crc=0
    ct=$(call_timeout)
    out=$(timeout "$ct" docker manifest inspect "$ref" 2>&1) || crc=$?
    if [ "$crc" -ne 0 ]; then
      if printf '%s' "$out" | grep -Eqi 'unauthorized|denied|forbidden|authentication required'; then
        echo "  registry refused ${ref}: $(printf '%s' "$out" | head -1)"
        return 2
      fi
      if [ "$crc" -eq 124 ] || ! printf '%s' "$out" | grep -Eqi 'no such manifest|manifest unknown|not found|name unknown'; then
        # Timeout, rate limit, 5xx, network: say so once per service so a ghcr
        # outage shows up long before the deadline.
        case "$logged_errors" in
          *" ${svc} "*) ;;
          *)
            logged_errors="${logged_errors}${svc} "
            if [ "$crc" -eq 124 ]; then
              echo "::warning::manifest check for ${ref} timed out after ${ct}s"
            else
              echo "::warning::manifest check for ${ref} failed (not a plain 'not found'): $(printf '%s' "$out" | head -3 | tr '\n' ' ')"
            fi
            ;;
        esac
      fi
      manifest_missing="${manifest_missing:+$manifest_missing }$svc"
      continue
    fi
    if [ "$svc" = "bot" ] && ! revision_matches "$ref"; then
      manifest_missing="${manifest_missing:+$manifest_missing }${svc}(revision mismatch)"
    fi
  done
  [ -z "$manifest_missing" ]
}

# True unless the image's revision label is present and differs from the full
# deploy SHA. An absent label or an unreadable config only warns (once).
revision_matches() {
  local ref="$1" labels revision
  if ! labels=$(timeout "$(call_timeout)" docker buildx imagetools inspect "$ref" --format '{{json .Image.Config.Labels}}' 2>/dev/null); then
    labels=""
  fi
  revision=$(printf '%s' "$labels" | jq -r '.["org.opencontainers.image.revision"] // empty' 2>/dev/null || true)
  if [ -z "$revision" ]; then
    if [ "$label_warned" = false ]; then
      label_warned=true
      echo "::warning::${ref} has no readable org.opencontainers.image.revision label, accepting on tag alone"
    fi
    return 0
  fi
  if [ "$revision" != "$commit_sha" ]; then
    echo "  ${ref} revision ${revision} != deploy SHA ${commit_sha}, treating as missing"
    return 1
  fi
  return 0
}

# Prints "<status> <conclusion>", or nothing when the run cannot be read.
run_state() {
  timeout "$(call_timeout)" gh run view "$run_id" --repo "$repo" --json status,conclusion \
    --jq '"\(.status) \(.conclusion)"' 2>/dev/null || true
}

# Last look at the run right before a success exit. Exits 1 if the run ended
# unsuccessfully meanwhile; returns 1 if it cannot be read (caller keeps
# polling); returns 0 when it is safe to deploy.
final_gate() {
  local st s c
  st=$(run_state)
  s=$(printf '%s' "$st" | awk '{print $1}')
  c=$(printf '%s' "$st" | awk '{print $2}')
  if [ -z "$s" ]; then
    echo "  run state unreadable at the final check, not deploying yet"
    return 1
  fi
  if [ "$s" = "completed" ] && [ "$c" != "success" ]; then
    echo "::error::docker-publish ended (conclusion=${c}) just before deploy, aborting"
    exit 1
  fi
  return 0
}

# Sleep until the next poll, or fail at the deadline. Never sleeps past it.
wait_or_die() {
  local left
  left=$(remaining)
  if [ "$left" -le 0 ]; then
    echo "::error::Timed out waiting for Docker images after ${max_wait}s (missing: ${manifest_missing:-none}, esm: ${esm:-n/a})"
    exit 1
  fi
  if [ "$left" -lt "$interval" ]; then
    sleep "$left"
  else
    sleep "$interval"
  fi
}

# Prints success, failure or pending for the bot job's ESM load step. Matrix
# jobs that skip the step report conclusion "skipped" and are ignored.
esm_state() {
  local lines line st con result="pending" seen=false
  lines=$(timeout "$(call_timeout)" gh api --paginate "repos/${repo}/actions/runs/${run_id}/jobs?per_page=100" \
    --jq ".jobs[].steps[]? | select(.name | startswith(\"${esm_step_prefix}\")) | select(.conclusion != \"skipped\") | \"\\(.status) \\(.conclusion)\"" \
    2>/dev/null || true)
  while read -r line; do
    [ -n "$line" ] || continue
    st=$(printf '%s' "$line" | awk '{print $1}')
    con=$(printf '%s' "$line" | awk '{print $2}')
    if [ "$st" = "completed" ] && [ "$con" != "success" ]; then
      echo failure
      return 0
    fi
    if [ "$st" = "completed" ]; then
      seen=true
    else
      seen=false
      break
    fi
  done <<<"$lines"
  [ "$seen" = true ] && result="success"
  echo "$result"
}

echo "==> Waiting for ${image_prefix}-{${services// /,}}:${tag} (docker-publish run ${run_id}, max ${max_wait}s)"

registry_blind=false

while true; do
  if [ "$(remaining)" -le 0 ]; then
    wait_or_die
  fi
  elapsed=$(($(date +%s) - start))

  state=$(run_state)
  status=$(printf '%s' "$state" | awk '{print $1}')
  conclusion=$(printf '%s' "$state" | awk '{print $2}')

  # Unreadable run state is not "still running": never allow success on it.
  if [ -z "$status" ]; then
    echo "  docker-publish: run state unreadable (${elapsed}s elapsed), retrying"
    wait_or_die
    continue
  fi

  # The run outranks the images: a finished, unsuccessful run never deploys.
  if [ "$status" = "completed" ] && [ "$conclusion" != "success" ]; then
    echo "::error::docker-publish ended (conclusion=${conclusion}), aborting deploy even if images exist"
    exit 1
  fi

  rc=0
  check_manifests || rc=$?

  if [ "$rc" -eq 2 ] && [ "$registry_blind" = false ]; then
    registry_blind=true
    echo "::warning::Cannot read ghcr manifests with this token; falling back to waiting for the whole docker-publish run."
  fi

  if [ "$status" = "completed" ]; then
    # conclusion is success here.
    if [ "$rc" -eq 1 ]; then
      # Run succeeded but a manifest is still absent: allow one registry
      # propagation retry, then fail rather than deploy a missing image.
      wait_or_die
      rc=0
      check_manifests || rc=$?
      if [ "$rc" -eq 1 ]; then
        echo "::error::docker-publish succeeded but images are missing for ${tag}: ${manifest_missing:-unknown}"
        exit 1
      fi
    fi
    # rc 0: images exist. rc 2: registry unreadable, trust the successful run.
    if final_gate; then
      if [ "$rc" -eq 2 ]; then
        echo "==> docker-publish succeeded (registry unreadable, trusting the run)."
      else
        echo "==> docker-publish succeeded and all images for ${tag} exist (${elapsed}s)."
      fi
      exit 0
    fi
    wait_or_die
    continue
  fi

  if [ "$rc" -eq 0 ]; then
    esm=$(esm_state)
    case "$esm" in
      success)
        if final_gate; then
          echo "==> All images for ${tag} exist and bot ESM load check passed (${elapsed}s). Deploying without waiting for Trivy/smoke/cache export."
          exit 0
        fi
        ;;
      failure)
        echo "::error::'${esm_step_prefix}' failed in docker-publish, aborting deploy (images exist but the bot does not load)"
        exit 1
        ;;
      *)
        echo "  docker-publish: ${status}, images exist, waiting for '${esm_step_prefix}' (${elapsed}s elapsed)"
        ;;
    esac
  elif [ "$rc" -eq 2 ]; then
    echo "  docker-publish: ${status} (${elapsed}s elapsed), registry unreadable"
  else
    echo "  docker-publish: ${status}, missing: ${manifest_missing} (${elapsed}s elapsed)"
  fi

  wait_or_die
done
