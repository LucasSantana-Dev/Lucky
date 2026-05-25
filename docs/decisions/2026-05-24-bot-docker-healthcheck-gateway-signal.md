# ADR: Bot Docker HEALTHCHECK — Gateway Readiness over Redis TCP Ping

**Date:** 2026-05-24  
**Status:** Accepted

## Context

The `production-bot` Dockerfile stage had a HEALTHCHECK that pinged the Redis TCP socket. This answered "can the bot process reach Redis?" but not "is the Discord gateway connected?"

A bot container could be `healthy` under this check while:

- Failing to authenticate with Discord (invalid token)
- Stuck in gateway reconnect backoff
- Blocked by a Discord API outage

`deploy.sh` already checks for `unhealthy` Docker containers and fails the deploy. The HEALTHCHECK signal is therefore the correct place to surface bot gateway connectivity — no CI or deploy-script changes are needed.

The bot's metrics server (`metricsServer.ts`) already exposes a `/healthz` route on `0.0.0.0:9091` that returns HTTP 200 when `client.isReady()` is true and 503 otherwise.

## Decision

Replace the Redis TCP ping in the bot's HEALTHCHECK with an HTTP GET against `localhost:9091/healthz`. Increase `start-period` from 30 s to 45 s to account for the additional time needed to complete Discord gateway login after process start.

```dockerfile
HEALTHCHECK --interval=15s --timeout=5s --start-period=45s --retries=3 \
    CMD node -e "require('http').get('http://127.0.0.1:9091/healthz',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
```

`curl` is not available in the Alpine base image, so the probe uses the native Node.js `http` module.

## Alternatives Considered

**Keep Redis TCP ping:** Preserved fast startup health signals (~1 s). Rejected because Redis connectivity does not imply gateway connectivity — the two failure modes are different and independent.

**Add a second HEALTHCHECK:** Docker only permits one HEALTHCHECK directive per stage. Not possible.

**Add `botReady` field to backend `/api/health` via Redis flag:** Requires bot + backend changes + deploy-script probe update. Rejected: the gateway check is indirect (mediated by Redis), has a race condition at startup (flag absent before first `ready` event), and does not auto-fail the deploy — an operator must check the JSON manually. See rejected Option B in research notes.

**`docker exec` introspection from deploy.sh:** Requires importing the full bot module graph; fragile and couples deploy logic to bot internals. Rejected.

## Consequences

**Positive:**

- A bot container that is running but not connected to Discord becomes `unhealthy`, which fails the deploy automatically. No CI or deploy-script changes needed.
- The healthcheck implicitly covers Redis reachability — the bot cannot complete `client.login()` and become ready if Redis is unreachable (session state, queue, etc.).
- Faster failure signal: `interval=15s` means gateway disconnect is detected within 45 s (interval × retries).

**Negative:**

- `start-period=45s` delays the first health check pass. If the bot connects to Discord in under 10 s (typical), the container is marked healthy immediately; if Discord is slow (> 45 s), the first check fires while the client is still connecting and is counted as a failure. Three consecutive failures (135 s total) would mark the container `unhealthy`. This is acceptable for a deploy-time gate.

**Neutral:**

- The metrics server (`METRICS_DISABLED=true`) is a no-op in tests. The healthcheck fires in production containers only.

## Revisit When

- The bot's startup time consistently exceeds 45 s (increase `start-period`).
- Discord gateway latency at cold start grows beyond 30 s routinely — monitor with `HEALTHCHECK_GATEWAY_CONNECT_MS` metric once Prometheus scraping is wired.
- `metricsServer.ts`'s `/healthz` route is removed or the metrics server is disabled by default.
