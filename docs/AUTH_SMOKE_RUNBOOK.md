# Discord Auth Smoke Runbook

Use this runbook after deploy changes that touch webhook/auth/deploy flow.

## Preconditions

- Production deploy already completed successfully.
- `https://lucky.lucassantana.tech` is reachable.
- Discord app credentials are configured and `/api/health/auth-config` returns `status=ok`.

## Manual steps (real browser)

1. Open `https://lucky.lucassantana.tech/api/auth/discord`.
2. Complete Discord login + authorization.
3. Confirm redirect callback lands in Lucky dashboard.
4. Confirm dashboard bootstrap works:
    - guild selector loads
    - settings/features views render
    - Twitch notification settings page loads
5. Verify session status transition:
    - authenticated after login: `GET /api/auth/status` -> `{"authenticated": true, ...}`
    - unauthenticated after logout/session clear: `GET /api/auth/status` -> `{"authenticated": false}`

## Evidence log (2026-03-14)

Timestamp (UTC): `2026-03-14T23:32:22Z`

Automated pre-check evidence captured:

- `http://127.0.0.1:8090/api/health` -> `HTTP 200`, body includes `"status":"ok"`
- `http://127.0.0.1:8090/api/health/auth-config` -> `HTTP 200`, body includes auth contract payload
- `http://127.0.0.1:8090/api/auth/discord` -> `HTTP 302` to Discord authorize URL
- `http://127.0.0.1:8090/api/auth/status` -> `{"authenticated":false}` before manual login

Manual browser-login evidence status:

- `PENDING OPERATOR EXECUTION`: real Discord login verification requires interactive operator session and Discord credentials/2FA approval.
- Agent-side browser automation was unavailable in this environment due missing Playwright Chrome install permissions.
