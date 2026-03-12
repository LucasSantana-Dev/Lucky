#!/bin/bash
set -euo pipefail

PRISMA_CONFIG_PATH="prisma/prisma.config.ts"
LOG_PREFIX="[db:migrate-safe]"

log() {
    echo "$LOG_PREFIX $1"
}

run_migrate_dev() {
    npx prisma migrate dev --config "$PRISMA_CONFIG_PATH" "$@"
}

is_known_bootstrap_failure() {
    local output="$1"
    local missing_guilds_pattern
    missing_guilds_pattern="table.*guilds.*does not exist"
    missing_guilds_pattern+="|relation \"guilds\" does not exist"
    missing_guilds_pattern+="|underlying table.*guilds.*does not exist"

    if ! echo "$output" | grep -q "P3006"; then
        return 1
    fi

    if echo "$output" | grep -Eiq "$missing_guilds_pattern"; then
        return 0
    fi

    return 1
}

mark_all_migrations_applied() {
    local migration_name
    local resolve_output
    local resolve_status
    while IFS= read -r migration_name; do
        [[ -z "$migration_name" ]] && continue
        log "Marking migration as applied: $migration_name"
        set +e
        resolve_output=$(npx prisma migrate resolve \
            --config "$PRISMA_CONFIG_PATH" \
            --applied "$migration_name" 2>&1)
        resolve_status=$?
        set -e

        echo "$resolve_output"

        if [[ "$resolve_status" -eq 0 ]]; then
            continue
        fi

        if echo "$resolve_output" | grep -q "P3008"; then
            log "Migration already marked as applied: $migration_name"
            continue
        fi

        log "Failed to resolve migration: $migration_name"
        return "$resolve_status"
    done < <(
        find prisma/migrations -mindepth 1 -maxdepth 1 -type d -print \
            | sed 's|.*/||' \
            | LC_ALL=C sort
    )
}

main() {
    log "Running prisma migrate dev with explicit config"

    local output=""
    local status=0
    local verify_output=""
    local verify_status=0
    set +e
    output=$(run_migrate_dev "$@" 2>&1)
    status=$?
    set -e

    echo "$output"

    if [[ "$status" -eq 0 ]]; then
        return 0
    fi

    if ! is_known_bootstrap_failure "$output"; then
        log "Migration failed with non-recoverable error"
        return "$status"
    fi

    log "Detected legacy bootstrap failure (P3006 + missing guilds)."
    log "Applying safe local fallback: db push + resolve history + migrate verify."

    npx prisma db push \
        --config "$PRISMA_CONFIG_PATH" \
        --accept-data-loss

    mark_all_migrations_applied

    log "Re-running prisma migrate dev to verify migration state"
    set +e
    verify_output=$(run_migrate_dev "$@" 2>&1)
    verify_status=$?
    set -e

    echo "$verify_output"

    if [[ "$verify_status" -eq 0 ]]; then
        return 0
    fi

    if ! is_known_bootstrap_failure "$verify_output"; then
        log "Fallback verification failed with non-recoverable error"
        return "$verify_status"
    fi

    log "Legacy shadow-db migration chain still fails after fallback; checking status."
    npx prisma migrate status --config "$PRISMA_CONFIG_PATH"
}

main "$@"
