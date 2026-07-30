#!/usr/bin/env bash
# Fire a pinned deploy as soon as the homelab's network is stable enough to
# finish one.
#
# Why this exists: a deploy needs three different hosts reachable across a
# ~5 minute span — github.com (git fetch), ghcr.io (image pull), and
# discord.com (the bot's 90s gateway health check). During the 2026-07-30
# outage the link came up in 10-20s bursts, so seven manual attempts each died
# at whichever host happened to be down at that instant. Timing the start by
# hand does not work; the window closes mid-deploy.
#
# So: require the network to hold for a SUSTAINED period before firing, and
# retry across windows unattended.
#
# Usage:
#   ./deploy-when-stable.sh <full-sha> [max-wait-minutes]
#
# Runs in the foreground. To leave it running:
#   nohup ./deploy-when-stable.sh <sha> 120 > /tmp/deploy-watchdog.log 2>&1 &

set -euo pipefail

TARGET_SHA="${1:-}"
MAX_WAIT_MIN="${2:-120}"

if [[ -z "$TARGET_SHA" ]]; then
    echo "usage: $0 <full-sha> [max-wait-minutes]" >&2
    exit 2
fi

# Hosts the deploy must reach, in the order it needs them.
PROBE_HOSTS=(github.com ghcr.io discord.com)

# A window counts as stable only after this many consecutive all-green rounds,
# spaced this far apart. 6 rounds x 10s = ~60s of uninterrupted connectivity
# before we commit. Lower and we fire into a burst; much higher and we never
# fire at all on a marginal link.
REQUIRED_GREEN_ROUNDS=6
ROUND_INTERVAL_S=10

WEBHOOK_CONTAINER="lucky-webhook"
DEPLOY_WRAPPER="/home/luk-server/Lucky/scripts/deploy-wrapper.sh"
DEPLOY_LOG="/tmp/lucky-deploy.log"
LOCK_FILE="/tmp/deploy-when-stable.lock"

log() { echo "[watchdog] $(date '+%H:%M:%S') $*"; }

# Single instance. Stacked watchdogs would race to fire the same deploy.
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
    log "another watchdog is already running (lock: $LOCK_FILE) — exiting"
    exit 0
fi

short_sha="${TARGET_SHA:0:7}"

already_deployed() {
    local running
    running=$(docker ps --filter 'name=lucky-bot' --format '{{.Image}}' 2>/dev/null | head -1)
    [[ "$running" == *":${short_sha}" ]]
}

if already_deployed; then
    log "already running ${short_sha} — nothing to do"
    exit 0
fi

probe_all_hosts() {
    local host
    for host in "${PROBE_HOSTS[@]}"; do
        timeout 3 getent hosts "$host" >/dev/null 2>&1 || return 1
    done
    return 0
}

# Wait for REQUIRED_GREEN_ROUNDS consecutive all-green probes. Any single
# failure resets the streak — a burst that drops mid-count is exactly the
# condition that broke the manual attempts.
wait_for_stable_window() {
    local deadline=$1 green=0 rounds=0 reachable=0
    while (( $(date +%s) < deadline )); do
        rounds=$((rounds + 1))
        if probe_all_hosts; then
            reachable=$((reachable + 1))
            green=$((green + 1))
            log "stable ${green}/${REQUIRED_GREEN_ROUNDS}"
            (( green >= REQUIRED_GREEN_ROUNDS )) && return 0
        elif (( green > 0 )); then
            log "window collapsed after ${green} round(s) — resetting"
            green=0
        fi

        # Heartbeat. Without this a persistently-red network produces no output
        # at all, so an operator cannot tell the watchdog from a hung process —
        # and cannot see whether the link is improving.
        if (( rounds % 30 == 0 )); then
            log "still waiting — ${reachable}/${rounds} rounds all-green so far"
        fi

        sleep "$ROUND_INTERVAL_S"
    done
    return 1
}

# The deploy script authenticates the caller with a shared secret it reads from
# DEPLOY_WEBHOOK_SECRET. Reference it by name inside the container so the value
# is never interpolated here, logged, or held in this script's environment.
fire_deploy() {
    docker exec "$WEBHOOK_CONTAINER" sh -c \
        "bash '$DEPLOY_WRAPPER' \"\$DEPLOY_WEBHOOK_SECRET\" '$TARGET_SHA'" >/dev/null 2>&1
}

# deploy-wrapper.sh returns immediately and runs deploy.sh detached, so poll the
# log for a terminal line rather than waiting on the process.
await_deploy_outcome() {
    local waited=0
    while (( waited < 600 )); do
        local tail_out
        tail_out=$(docker exec "$WEBHOOK_CONTAINER" sh -c "tail -40 '$DEPLOY_LOG'" 2>/dev/null || true)

        if grep -qE 'Deploy (complete|successful)|deployed successfully' <<<"$tail_out"; then
            return 0
        fi
        if grep -qE 'AUTO-ROLLBACK|ROLLBACK ERROR|ERROR: (CHECKOUT|LOCK|pull of pinned)|Deploy failed' <<<"$tail_out"; then
            grep -E '^\[deploy\].*(ERROR|ROLLBACK)' <<<"$tail_out" | tail -2 | sed 's/^/[watchdog]   /'
            return 1
        fi
        sleep 15
        waited=$((waited + 15))
    done
    log "deploy did not reach a terminal state within 10m"
    return 1
}

end_by=$(( $(date +%s) + MAX_WAIT_MIN * 60 ))
attempt=0

log "watching for a stable window to deploy ${short_sha} (giving up after ${MAX_WAIT_MIN}m)"
log "probing: ${PROBE_HOSTS[*]}"

while (( $(date +%s) < end_by )); do
    if ! wait_for_stable_window "$end_by"; then
        log "no stable window found before the deadline"
        exit 1
    fi

    attempt=$((attempt + 1))
    log "network stable — firing deploy (attempt ${attempt})"

    if ! fire_deploy; then
        log "could not start the deploy (docker exec failed) — will retry"
        sleep 30
        continue
    fi

    if await_deploy_outcome; then
        if already_deployed; then
            log "SUCCESS: production is running ${short_sha}"
            exit 0
        fi
        log "deploy reported success but ${short_sha} is not running — treating as failure"
    fi

    log "attempt ${attempt} failed — waiting for the next window"
    sleep 30
done

log "gave up after ${MAX_WAIT_MIN}m and ${attempt} attempt(s); production untouched on the last-good build"
exit 1
