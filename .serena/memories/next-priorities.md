# Next Priorities (2026-03-11)

## Completed in This Session
- ✅ Dashboard/RBAC/identity/runtime stabilization and cross-page E2E contract alignment.
- ✅ OAuth callback canonicalization to API-domain logic implemented and tested.
- ✅ Full verification matrix green (`lint`, `type:check`, `build`, backend/bot/frontend tests, frontend e2e).
- ✅ Security remediation complete (`npm audit --audit-level=high` returns zero vulnerabilities).
- ✅ Release metadata prepared for `v2.6.10` (version/changelog/docs updated).

## Ranked Top 3
1. **Deploy `v2.6.10` and validate OAuth end-to-end in production**
   - Push/merge release branch, deploy backend/frontend, verify:
   - `/api/auth/discord` emits API callback redirect URI
   - login flow returns authenticated session and persists on reload

2. **Close remaining production auth risk via strict portal/env cleanup**
   - Keep only canonical Discord redirect:
     `https://lucky-api.lucassantana.tech/api/auth/callback`
   - Confirm production env values (`WEBAPP_BACKEND_URL`,
     `WEBAPP_REDIRECT_URI`, `WEBAPP_FRONTEND_URL`, `CLIENT_SECRET`)
   - Re-run post-deploy health checks and auth smoke

3. **RBAC UX hardening and manager workflows**
   - Add explicit RBAC manager telemetry/events for policy changes
   - Add UI affordances for role grant diffs before save
   - Expand permission-focused integration tests for mixed-role users

## Notes
- Keep URL paths unchanged while iterating UX and permissions behavior.
- Maintain deny-by-default RBAC model with admin override.
