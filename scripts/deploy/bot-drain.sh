#!/bin/bash
# Bot drain for deploys (#2872): do not recreate the bot while people are
# listening. Sourced by scripts/deploy.sh, which provides log, notify,
# docker_compose, LOCK_DIR and LOCK_PID_FILE.
#
# When the bot needs a recreate and a session has someone listening, the
# deploy rolls out everything else and leaves the running bot alone. A detached
# watcher then polls the bot and recreates it once the rooms are empty. The
# wait is capped: BOT_DRAIN_TIMEOUT_SECONDS after the first deferral the bot is
# recreated anyway, by the watcher or by the next deploy.
#
# Knobs (environment):
#   DEPLOY_FORCE_BOT_RESTART=true  recreate now, without waiting
#   BOT_DRAIN_TIMEOUT_SECONDS      longest wait from the first deferral (4h)
#   BOT_DRAIN_POLL_SECONDS         watcher poll interval (60s)
#   BOT_DRAIN_HEALTH_SECONDS       how long a recreated bot gets to be healthy (180s)
#   BOT_LISTENERS_CMD              test seam: prints the listener count

BOT_DRAIN_TIMEOUT_SECONDS="${BOT_DRAIN_TIMEOUT_SECONDS:-14400}"
BOT_DRAIN_POLL_SECONDS="${BOT_DRAIN_POLL_SECONDS:-60}"
BOT_DRAIN_HEALTH_SECONDS="${BOT_DRAIN_HEALTH_SECONDS:-180}"
# Under DEPLOY_DIR like the last-good file, so the cap survives a webhook
# container restart. Ignored by git, so the deploy's `git clean` keeps it.
BOT_DEFERRED_SINCE_FILE="${BOT_DEFERRED_SINCE_FILE:-${DEPLOY_DIR:-/repo}/.deploy-bot-deferred-since}"
BOT_DRAIN_PID_FILE="${BOT_DRAIN_PID_FILE:-/tmp/lucky-bot-drain.pid}"
BOT_DRAIN_CONTAINER="${BOT_DRAIN_CONTAINER:-lucky-bot}"

# Prints the bot's lucky_bot_active_listener_sessions gauge. Fails when the
# bot is down, predates the gauge, or reports -1 (queues unreadable).
bot_active_listeners() {
    local out
    if [[ -n "${BOT_LISTENERS_CMD:-}" ]]; then
        out=$($BOT_LISTENERS_CMD 2>/dev/null) || return 1
    else
        # The bot image has node but no curl; read /metrics from inside it.
        out=$(docker exec "$BOT_DRAIN_CONTAINER" node -e '
            const port = process.env.METRICS_PORT || 9091
            fetch(`http://127.0.0.1:${port}/metrics`, { signal: AbortSignal.timeout(5000) })
                .then((r) => r.text())
                .then((t) => {
                    const m = t.match(/^lucky_bot_active_listener_sessions(?:\{[^}]*\})?\s+(-?\d+)/m)
                    if (!m) process.exit(3)
                    console.log(m[1])
                })
                .catch(() => process.exit(2))
        ' 2>/dev/null) || return 1
    fi
    [[ "$out" =~ ^[0-9]+$ ]] || return 1
    printf '%s\n' "$out"
}

# False only when docker says the bot is stopped; an inspect error is unknown
# and counts as running, so a docker hiccup never cuts a session short.
bot_drain_running() {
    local state
    state=$(docker inspect "$BOT_DRAIN_CONTAINER" --format '{{.State.Running}}' 2>/dev/null) || return 0
    [[ "$state" == "true" ]]
}

# True once the first deferral is BOT_DRAIN_TIMEOUT_SECONDS old.
bot_drain_cap_reached() {
    local since
    since=$(cat "$BOT_DEFERRED_SINCE_FILE" 2>/dev/null || true)
    [[ "$since" =~ ^[0-9]+$ ]] && (( $(date +%s) - since >= BOT_DRAIN_TIMEOUT_SECONDS ))
}

bot_force_restart_requested() {
    [[ "${DEPLOY_FORCE_BOT_RESTART:-}" =~ ^(1|true|yes)$ ]]
}

bot_drain_clear() {
    rm -f "$BOT_DEFERRED_SINCE_FILE" 2>/dev/null || true
}

# Sets BOT_DRAIN_DECISION to "recreate" or "defer" and logs why.
# Arg 1 "schema_changed": the database schema moved since the running bot's
# commit; the migrations already ran, so an old bot must not keep running on
# the new schema. Arg 1 "watch": called by the watcher, where an unreadable
# count skips one poll (until the cap) instead of cutting off a session.
# BOT_DRAIN_LISTENERS is set to the count read (empty when unknown), so the
# caller can say how many people a forced recreate cut off. Call it directly,
# not in $(...): the results are globals and log writes to stdout.
bot_drain_decide() {
    local mode="${1:-}" now since
    BOT_DRAIN_LISTENERS=""
    BOT_DRAIN_DECISION=recreate
    if bot_force_restart_requested; then
        log "Bot drain: DEPLOY_FORCE_BOT_RESTART set; recreating without waiting"
        BOT_DRAIN_DECISION=recreate
        return 0
    fi
    if ! BOT_DRAIN_LISTENERS=$(bot_active_listeners); then
        BOT_DRAIN_LISTENERS=""
        # A stopped bot has nobody to protect; only a running one waits.
        if [[ "$mode" == "watch" ]] && bot_drain_running && ! bot_drain_cap_reached; then
            log "Bot drain: listener count unavailable; checking again next poll"
            BOT_DRAIN_DECISION=defer
            return 0
        fi
        log "Bot drain: listener count unavailable; recreating as before"
        BOT_DRAIN_DECISION=recreate
        return 0
    fi
    if (( BOT_DRAIN_LISTENERS == 0 )); then
        log "Bot drain: nobody listening; recreating"
        BOT_DRAIN_DECISION=recreate
        return 0
    fi
    if [[ "$mode" == "schema_changed" ]]; then
        log "Bot drain: ${BOT_DRAIN_LISTENERS} session(s) listening, but the schema changed; recreating"
        BOT_DRAIN_DECISION=recreate
        return 0
    fi
    now=$(date +%s)
    since=$(cat "$BOT_DEFERRED_SINCE_FILE" 2>/dev/null || true)
    if ! [[ "$since" =~ ^[0-9]+$ ]]; then
        since="$now"
        # Without the record the cap could never fire: recreate instead.
        if ! printf '%s\n' "$since" >"$BOT_DEFERRED_SINCE_FILE" 2>/dev/null; then
            log "WARN: could not record bot deferral start to $BOT_DEFERRED_SINCE_FILE; recreating instead"
            BOT_DRAIN_DECISION=recreate
            return 0
        fi
    fi
    if (( now - since >= BOT_DRAIN_TIMEOUT_SECONDS )); then
        log "Bot drain: ${BOT_DRAIN_LISTENERS} session(s) listening, but deferred for $(( (now - since) / 60 )) min (cap $(( BOT_DRAIN_TIMEOUT_SECONDS / 60 )) min); recreating"
        BOT_DRAIN_DECISION=recreate
        return 0
    fi
    log "Bot drain: ${BOT_DRAIN_LISTENERS} session(s) listening; deferring the bot recreate"
    BOT_DRAIN_DECISION=defer
}

# Stops a watcher left by an earlier deploy: the current deploy decides again.
bot_drain_cancel() {
    local pid
    pid=$(cat "$BOT_DRAIN_PID_FILE" 2>/dev/null || true)
    if [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null; then
        kill "$pid" 2>/dev/null || true
        log "Bot drain: stopped the watcher from an earlier deploy (pid $pid)"
    fi
    rm -f "$BOT_DRAIN_PID_FILE" 2>/dev/null || true
}

bot_drain_wait_healthy() {
    local waited=0 health
    while (( waited < BOT_DRAIN_HEALTH_SECONDS )); do
        health=$(docker inspect "$BOT_DRAIN_CONTAINER" --format '{{.State.Health.Status}}' 2>/dev/null || true)
        [[ "$health" == "healthy" ]] && return 0
        sleep 5
        waited=$((waited + 5))
    done
    return 1
}

# Recreates the bot from the current IMAGE_TAG under the deploy lock. If the
# new bot never turns healthy, puts the previous image back by its image ID
# (re-tagged), since the tag may now point at the new image (e.g. latest).
# Returns 2 when compose could not even start the recreate (nothing changed).
bot_drain_recreate() {
    local previous_id previous_ref rollback_tag="drain-rollback"
    previous_id=$(docker inspect "$BOT_DRAIN_CONTAINER" --format '{{.Image}}' 2>/dev/null || true)
    previous_ref=$(docker inspect "$BOT_DRAIN_CONTAINER" --format '{{.Config.Image}}' 2>/dev/null || true)
    if ! docker_compose up -d --no-deps bot; then
        # The watcher retries this every poll, so it notifies only when it
        # gives up.
        log "Bot drain ERROR: docker compose up for the bot failed"
        return 2
    fi
    if bot_drain_wait_healthy; then
        log "Bot drain: bot recreated on ${IMAGE_TAG} and healthy"
        return 0
    fi
    log "Bot drain ERROR: bot on ${IMAGE_TAG} not healthy after ${BOT_DRAIN_HEALTH_SECONDS}s"
    if [[ -n "$previous_id" && "$previous_ref" == *:* ]] \
        && docker tag "$previous_id" "${previous_ref%:*}:${rollback_tag}" \
        && IMAGE_TAG="$rollback_tag" docker_compose up -d --no-deps bot; then
        log "Bot drain: put the bot back on its previous image ${previous_id}"
        notify 16711680 "Bot Restart Failed" "Bot on ${IMAGE_TAG} was unhealthy; back on the previous image"
    else
        notify 16711680 "Bot Restart Failed" "Bot on ${IMAGE_TAG} is unhealthy and the previous image could not be restored"
    fi
    return 1
}

# Watcher body. deploy.sh runs it detached once a deploy that deferred the bot
# has finished. It exits when a newer deploy replaces it (pid file changes) or
# recreates the bot itself (deferral file gone).
bot_drain_watch() {
    trap - EXIT
    set +e
    local me="${BASHPID:-$$}"
    printf '%s\n' "$me" >"$BOT_DRAIN_PID_FILE"
    log "Bot drain watcher started (pid $me, poll ${BOT_DRAIN_POLL_SECONDS}s)"
    while :; do
        sleep "$BOT_DRAIN_POLL_SECONDS"
        [[ "$(cat "$BOT_DRAIN_PID_FILE" 2>/dev/null)" == "$me" ]] || return 0
        if [[ ! -f "$BOT_DEFERRED_SINCE_FILE" ]]; then
            log "Bot drain watcher: deferral cleared elsewhere; exiting"
            rm -f "$BOT_DRAIN_PID_FILE"
            return 0
        fi
        # A deploy in progress decides for itself and stops this watcher.
        [[ -d "$LOCK_DIR" ]] && continue
        bot_drain_decide watch
        [[ "$BOT_DRAIN_DECISION" == "recreate" ]] || continue
        mkdir "$LOCK_DIR" 2>/dev/null || continue
        printf '%s\n' "$me" >"$LOCK_PID_FILE"
        if [[ -n "$BOT_DRAIN_LISTENERS" && "$BOT_DRAIN_LISTENERS" != "0" ]]; then
            notify 16753920 "Bot Restart" "Restarting the bot with ${BOT_DRAIN_LISTENERS} session(s) listening: waited the full $(( BOT_DRAIN_TIMEOUT_SECONDS / 60 )) min"
        fi
        bot_drain_recreate
        if [[ $? -eq 2 ]]; then
            rm -rf "$LOCK_DIR" 2>/dev/null || true
            # Compose failed before touching the bot: keep the deferral and
            # try again next poll, until the cap.
            bot_drain_cap_reached || continue
            notify 16711680 "Bot Restart Failed" "Deferred bot recreate kept failing until the cap; the old bot is still running and the next deploy retries"
        fi
        bot_drain_clear
        rm -rf "$LOCK_DIR" 2>/dev/null || true
        rm -f "$BOT_DRAIN_PID_FILE"
        return 0
    done
}
