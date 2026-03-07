# Nexus — Known Gotchas

Last updated: 2026-03-07 (Session 11)

## Prisma 7
- `url` removed from `datasource` block — use `prisma.config.ts` for CLI
- PrismaClient requires `@prisma/adapter-pg` driver adapter in constructor
- Generator changed: `prisma-client-js` → `prisma-client` with `engineType = "client"`
- Prisma 7 transitive vulns: @hono/node-server, lodash via chevrotain — fix with npm overrides
- npm overrides don't always reach nested node_modules — run `npm audit fix` after adding overrides

## Build
- `packages/shared` must build first before other packages
- `packages/backend/tsconfig.json` excludes `tests/` — test type errors don't block build
- `@discord-player/extractor` is separate from `discord-player` — install explicitly
- `connect-redis`: named import `{ RedisStore }`, not default — tsc rejects default
- Mock must return `{ RedisStore: jest.fn()... }` to match named import

## Testing
- Jest 30 `forceExit` causes exit code 1 even when all tests pass — check `Tests:` line
- Service unit tests use deep imports (`@nexus/shared/services/ModerationService`) bypassing barrel mock
- `diagnostics: false` in ts-jest hides test type errors during `npm test`
- Frontend tests need ResizeObserver mock + pointer capture polyfills in setup.ts

## E2E Tests (Playwright)
- `networkidle` → `domcontentloaded` (Vite HMR blocks networkidle)
- Always use `route.fulfill()` not `route.continue()`
- Zustand persist interferes with logout/error tests — clear localStorage

## Dependencies
- `--legacy-peer-deps` required (eslint-plugin-react-hooks caps peer at eslint ^9)
- Batch `sed` misses `.cjs` files — run separately

## Git / CI
- Commitlint requires lowercase subject, max 72 chars header
- Pre-commit runs `npm audit --audit-level=critical` — use `HUSKY=0` for non-code commits

## Deploy
- `deploy.yml` uses `DEPLOY_PATH` secret — default `/opt/nexus`
- Server-side directory may still be named `LukBot` — rename on server

## Express 5
- `req.query` is read-only — cannot reassign in middleware
