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
- **Jest mock hoisting (all packages)**: `jest.mock()` factory functions are hoisted above variable declarations — mock objects must be created INSIDE the factory, not referenced from outer scope. Use trampoline pattern: `const mockFn = jest.fn()` before mock, then `(...args) => mockFn(...args)` inside factory
- **Jest 30 CLI**: `--testPathPattern` replaced by `--testPathPatterns` (no helpful error, just fails)
- **Frontend DnD tests**: `@testing-library/user-event` doesn't support DnD — use `fireEvent.dragStart/dragOver/drop` from `@testing-library/react`
- **timingSafeEqual**: throws on buffer length mismatch — outer try/catch returns generic error, not `invalid_state`
- **jest.clearAllMocks vs resetModules**: `clearAllMocks()` resets `mockImplementation` on constructors, breaking cached module mocks. Use `jest.resetModules()` + re-import for constructor-heavy mocks (e.g. discord-player Player)
- **Bot ESM + ts-jest**: Bot is `"type": "module"` but tests use `ts-jest` with CJS transform — works with `diagnostics: false` and `esModuleInterop: true` in ts-jest config

- **npm workspaces + Docker**: ALL workspace package.json files must be COPY'd during `npm ci` — even ones you don't build. Missing workspaces breaks dependency hoisting (`tsc: not found`, etc.)
- **OAuth callback URLs**: Use `WEBAPP_BACKEND_URL` env var for OAuth callbacks, don't derive from frontend URL. Behind nginx proxy they're the same, but split deployments diverge
- **Deploy webhook 405**: Homelab nginx returns 405 on POST — webhook endpoint not configured. Need server-side nginx `location /webhook { ... }` config
- **Playwright CWD**: Running `npx playwright test` changes CWD to `packages/frontend`. Use `git -C <repo_root>` for git commands after E2E runs
- **SonarCloud org key**: `lucassantana-dev` (not `luksantana`). API: `/organizations/search?member=true` to find actual key. Project key: `LucasSantana-Dev_NexusBot`
- **sonar.tests property**: Only accepts directory paths (no wildcards). Use `sonar.test.inclusions` for glob patterns
- **youtube-dl-exec CI**: postinstall downloads yt-dlp binary, hits GitHub API rate limits. Fix: `npm ci --ignore-scripts` + explicit `npx prisma generate`
- **SonarCloud action**: Must use v6+ (v5 deprecated with security issues)
- **CI build order**: `npm run build:shared` MUST run before lint/type-check — bot/backend reference shared declarations
- **commitlint**: Subject must be lowercase — `fix: correct sonarCloud...` fails, `fix: correct sonarcloud...` passes

## Architecture
- **Music routes**: Split into `music/playbackRoutes.ts`, `music/queueRoutes.ts`, `music/stateRoutes.ts` with shared `music/helpers.ts`
- **Redis caching pattern**: `isHealthy()` → `get(key)` → cache hit return / DB query → `setex(key, TTL, JSON.stringify(result))`. Invalidate on write with `del(key)`
- **Feature flags**: Two-tier: Unleash (optional) → env vars (`FEATURE_<NAME>=true|false`) → defaults. Defined in `packages/shared/src/config/featureToggles.ts`