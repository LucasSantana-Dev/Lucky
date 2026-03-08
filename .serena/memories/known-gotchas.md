# Known Gotchas

## Testing
- **express-session mock**: setup.ts only sets `req.sessionID` from cookie header. All authed supertest requests MUST include `.set('Cookie', ['sessionId=valid_session_id'])` or requireAuth returns 401
- **SSE endpoints**: `text/event-stream` responses keep connection open — incompatible with supertest's `.expect()`. Use raw `http.get()` or skip SSE-specific assertions
- **Backend test directory**: Must run `npx jest` from `packages/backend/` for `diagnostics: false` in ts-jest to work. Running from root with `--workspace` may show TS errors
- **Redis caching tests**: Import services via `@nexus/shared/services/CustomCommandService` (moduleNameMapper path) to get real implementation instead of setup.ts global mock of `@nexus/shared/services`
- **Jest 30 typing**: `mockRejectedValue(new Error('msg'))` needs `as never` cast: `mockRejectedValue(new Error('msg') as never)`
- **Pre-commit hook**: Runs `npm audit --audit-level=critical` which can fail on transitive deps. Use `HUSKY=0` for non-code commits
- **shared package**: Must `npm run build:shared` before running backend tests if shared source changed
- **discord-player-youtubei v2**: Linter may rewrite playerFactory.ts with yt-dlp approach — changes are intentional per linter config
- **Bot jest.mock hoisting**: `jest.mock()` factory functions are hoisted above variable declarations — mock objects must be created INSIDE the factory, not referenced from outer scope
- **jest.clearAllMocks vs resetModules**: `clearAllMocks()` resets `mockImplementation` on constructors, breaking cached module mocks. Use `jest.resetModules()` + re-import for constructor-heavy mocks (e.g. discord-player Player)
- **Bot ESM + ts-jest**: Bot is `"type": "module"` but tests use `ts-jest` with CJS transform — works with `diagnostics: false` and `esModuleInterop: true` in ts-jest config

## Architecture
- **Music routes**: Split into `music/playbackRoutes.ts`, `music/queueRoutes.ts`, `music/stateRoutes.ts` with shared `music/helpers.ts`
- **Redis caching pattern**: `isHealthy()` → `get(key)` → cache hit return / DB query → `setex(key, TTL, JSON.stringify(result))`. Invalidate on write with `del(key)`
- **Feature flags**: Two-tier: Unleash (optional) → env vars (`FEATURE_<NAME>=true|false`) → defaults. Defined in `packages/shared/src/config/featureToggles.ts`