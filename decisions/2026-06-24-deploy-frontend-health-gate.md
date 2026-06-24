# Deploy: gate on lucky-frontend + verify the served dashboard SPA

- Status: accepted
- Date: 2026-06-24
- Method: /deep-research (deploy root-cause investigation)

## Context

The v2.23.0 release deployed and every signal was green — the "Deploy to Homelab"
workflow's `Validate deployed version` (backend SHA via `/api/health/version`),
auth-config + OAuth-redirect smoke checks all passed, and the bot's `/version`
reported v2.23.0 — yet the deploy was observably "not done" (the dashboard surface).

Root cause: `scripts/deploy.sh` **pulls and starts** `lucky-frontend`
(`docker compose pull/up … frontend …`) but **never verifies it**:

- `require_running_containers()` listed `lucky-backend lucky-nginx lucky-postgres
lucky-redis lucky-bot` — **`lucky-frontend` was absent**.
- `run_health_checks()` only probed backend endpoints (`/api/health`,
  `/api/health/auth-config`) — **nothing checked the dashboard**.

`lucky-frontend` is a long-running nginx (`Dockerfile` target `production-frontend`:
`CMD ["nginx","-g","daemon off;"]`, `restart: unless-stopped`) that serves the built
SPA from its image; the main `lucky-nginx` reverse-proxies `/` to it. So a frontend
that was down, crashed, or pulled a stale image would leave the dashboard broken
(502 / old assets) while the deploy reported full success — and the deploy verifies
only the bot + backend, neither of which reflects the frontend.

This is a **recurrence of "Gap E"** — the same "service in the prod compose but
missing from `require_running_containers`" defect that
`decisions/2026-05-24-deploy-lock-contention-signal.md` fixed for `lucky-bot`.

## Decision

In `scripts/deploy.sh`:

1. Add `lucky-frontend` to `require_running_containers()` (safe: it's long-running
   with `restart: unless-stopped`, so requiring `State.Running` cannot false-fail a
   healthy deploy).
2. Add an HTTP readiness check in `run_health_checks()` that fetches `http://nginx:8080/`
   (the dashboard, via the reverse proxy) and matches the React mount point
   `id="root"` — confirming the SPA actually renders end-to-end (main nginx →
   lucky-frontend → index.html), not just that a container is up.

Both run before the success signal, so a broken frontend now fails health checks and
triggers the existing auto-rollback path.

## Consequences

- A down/crashed/unreachable frontend now **fails the deploy** instead of passing.
- **Not covered:** a frontend that is _running but serving a stale image_ (old build
  still has `id="root"`). Detecting staleness needs a build-version marker in the
  served HTML/assets compared against the expected release — tracked as follow-up.

## Prevention rule

Any new **long-running** service added to the production `docker-compose.yml` MUST be
added to `require_running_containers()` (and HTTP-health-checked if user-facing). To
stop this class recurring a 3rd time, prefer **deriving** the required list from
`docker compose config --services` (minus known one-shots) rather than a hand-maintained
array. Tracked in the follow-up issue.
