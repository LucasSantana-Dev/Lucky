# Lucky Current State (2026-03-11)

## Version / Branch
- Version: `2.6.10` (local release-ready state)
- Active branch: `feature/dashboard-rbac-access`
- Workspace state: large staged release bundle across backend, bot, frontend,
  docs, tests, and branding assets

## Shipped in This Session
- OAuth callback hardening now canonicalizes production callback resolution to
  API origin:
  - `packages/backend/src/utils/oauthRedirectUri.ts`
  - behavior: `WEBAPP_BACKEND_URL` canonical callback first, with production
    request-host fallback for legacy frontend-origin callback values
- Auth config health now accepts callback origin from frontend or backend
  origin:
  - `packages/backend/src/utils/authHealth.ts`
  - `packages/backend/src/routes/health.ts`
- Backend OAuth and health tests updated and passing for the canonical callback
  contract.
- Dependency/security remediation finalized:
  - removed Deezer from music source contracts and UI surfaces
  - replaced optional `@discordjs/opus` with `opusscript`
  - pinned overrides: `tar>=7.5.11`, `hono>=4.12.7`, `file-type>=21.3.1`
- Documentation/env updates for API-domain OAuth callback:
  - `.env.example`, `README.md`, `docs/WEBAPP_SETUP.md`,
    `docs/DEPENDENCIES.md`, `docs/DEPENDENCY_UPDATES.md`
- Release metadata updated:
  - `package.json` version bumped to `2.6.10`
  - `CHANGELOG.md` includes `2.6.10` entries for OAuth/runtime/security fixes

## Verification Evidence (fresh)
- `npm run lint` ✅
- `npm run type:check` ✅
- `npm run build` ✅
- `npm run test --workspace=packages/backend` ✅ (45 suites, 554 tests)
- `npm run test --workspace=packages/bot -- --runInBand` ✅ (44 suites, 246 tests)
- `npm run test --workspace=packages/frontend` ✅ (34 files, 264 tests)
- `npm run test:e2e --workspace=packages/frontend` ✅ (190 specs)
- `npm audit --audit-level=high` ✅ (`found 0 vulnerabilities`)

## Live Runtime Note
- External smoke (`curl -I https://lucky-api.lucassantana.tech/api/auth/discord`)
  still currently returns `redirect_uri=https://lucky.lucassantana.tech/api/auth/callback`
  before this code/deploy is rolled out.
- This is expected until backend deploy + env sync are applied with:
  - `WEBAPP_BACKEND_URL=https://lucky-api.lucassantana.tech`
  - `WEBAPP_REDIRECT_URI=https://lucky-api.lucassantana.tech/api/auth/callback`

## Outstanding Operational Work
- Deploy this release bundle to production.
- Ensure Discord Developer Portal redirect list contains only canonical callback
  after rollout validation.
- Complete post-deploy OAuth/authenticated smoke to confirm
  `authenticated=true` session persistence on refresh.
