# ADR: Deploy Bot Health Gate — Required Container + Gateway Poll

**Date:** 2026-05-24  
**Status:** Accepted

## Context

`deploy.sh` validated service health via:

1. `require_running_containers` — checked backend, nginx, postgres, redis but not the bot.
2. A `docker ps --format json | grep '"unhealthy"'` check at T+10s after startup.

Two gaps existed:

**Crash gap:** If `lucky-bot` crashed immediately after `docker_compose up -d` (OOM, bad env, import error), `require_running_containers` passed (bot not in the list), the unhealthy check passed (an exited container is not "unhealthy"), and deploy.sh reported success while the bot was dead.

**Timing gap (dead code):** The unhealthy grep ran at T+10s. Every container in the stack has a start-period ≥ 5s and 3 retries — the earliest any container can reach "unhealthy" is T+90s. The check could never catch anything and gave a false sense of coverage.

**Gateway connectivity gap:** `lucky-bot`'s HEALTHCHECK (added in the same series, see `2026-05-24-bot-docker-healthcheck-gateway-signal.md`) marks the container unhealthy when `client.isReady()` is false for 3 consecutive intervals. But the deploy health check ran at T+10s, 35s before the bot's first HEALTHCHECK fires.

## Decision

Three changes to `deploy.sh`:

1. **Add `lucky-bot` to `require_running_containers`.** Catches crash-on-startup with zero deploy-time overhead.

2. **Remove the T+10s unhealthy grep.** It was dead code: the timing math makes it impossible for any container in the stack to be "unhealthy" at T+10s. Removing it removes the false sense of coverage.

3. **Add a bot health wait loop after the two `wait_for_http_ready` checks.** By the time the backend API and auth-config health checks pass (~T+40-50s on a rebuild deploy), the bot's 45s start-period has nearly elapsed. The loop polls `docker inspect lucky-bot` for `Health.Status`:
    - `healthy` → continue immediately.
    - `unhealthy` → fail the deploy.
    - Timeout (90s) → warn and continue (graceful degradation for slow Discord connections or Discord outages).

The loop is placed after the API health checks deliberately: the wait-time "stacks" with the backend readiness checks, so the bot poll rarely adds meaningful wall-clock time on the happy path.

## Alternatives Considered

**Add bot to required array only:** Catches crash-on-startup but leaves the gateway connectivity gap open. The HEALTHCHECK (PR #1047) was added specifically to surface gateway failures via the unhealthy check — with dead-code timing, that ADR's stated intent was not fulfilled.

**Extend `sleep 10` to `sleep 60`:** Would push past the bot's start-period unconditionally on every deploy, even when services are already running. Adds 50s to every deploy including no-rebuild paths where containers are never restarted.

**Fail hard on timeout (no graceful degradation):** If Discord has a transient outage during a deploy, the deploy fails even though the code and database are healthy. Re-deploying won't help; the operator would need to wait for Discord to recover and restart the container manually. Warn-on-timeout is the correct behavior for an external dependency.

**Poll `/healthz` via `docker exec`:** More direct than Docker's health status — skips the start-period artificial wait. Rejected because it adds exec overhead, requires the container to be fully running before exec works, and the timing advantage is small (~5-15s) given that the API health checks already absorb most of the wait.

## Consequences

**Positive:**

- Bot crash-on-startup now fails the deploy instead of silently passing.
- The unhealthy grep dead code is removed; the bot health wait loop is the explicit, readable gate.
- On a full-rebuild deploy, the bot health poll adds ~5-15s after the API health checks pass (bot connects to Discord in <10s typically; by that point the start-period may still be active but the first check fires shortly after).
- On a non-rebuild deploy (services already running), `docker inspect` returns "healthy" immediately — zero added time.

**Negative:**

- On unhappy path (bot gateway fails), the deploy takes up to 90s longer before failing. This is bounded and the failure is definitive.
- If Discord has a sustained outage (>90s) during a deploy, the deploy proceeds with a warning — the operator sees the warning in deploy logs but CI still passes. This is intentional: Discord outages are not deploy failures.

**Neutral:**

- The `print_targeted_logs` function logs backend/nginx/postgres/redis on failure; on bot health failure the bot's own logs are printed instead (more targeted).

## Revisit When

- Bot startup consistently takes >90s (increase the poll timeout).
- Discord outages during deploys become frequent enough that the warn-on-timeout creates confusion — consider adding a Discord status API check to distinguish "Discord is down globally" from "our bot's token is invalid".
- The `require_running_containers` list grows stale as services are added or removed.
