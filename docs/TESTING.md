# Testing

This document describes the testing strategy and how to run tests locally.

## Strategy

| Layer       | Where                                 | Tool             | Scope                            |
| ----------- | ------------------------------------- | ---------------- | -------------------------------- |
| Unit        | `packages/backend/tests/unit/`        | Jest             | Services, middleware, pure logic |
| Integration | `packages/backend/tests/integration/` | Jest + supertest | API routes, DB/Redis (when used) |
| E2E         | `packages/frontend/tests/e2e/`        | Playwright       | Frontend flows in browser        |

Backend tests use Jest; frontend uses Playwright for E2E only (no Jest/Vitest unit tests in frontend at this time). Bot and shared packages do not have dedicated test suites yet; coverage is reported from the backend.

## Backend (Jest)

- **Location**: `packages/backend/tests/` (unit and integration).
- **Config**: `packages/backend/jest.config.cjs` (ts-jest, coverage thresholds 70%).
- **Coverage output**: `packages/backend/coverage/` (lcov, HTML, text).

**Commands** (from repo root):

```bash
npm run test                    # Backend tests (watch-friendly locally)
npm run test:ci                 # Backend tests in CI mode (single run, no watch)
npm run test:coverage           # Backend tests with coverage report
```

From `packages/backend`:

```bash
npm test
npm run test:coverage
npm run test:watch
```

## Frontend E2E (Playwright)

- **Location**: `packages/frontend/tests/e2e/`.
- **Config**: `packages/frontend/playwright.config.ts` (Chromium, dev server on port 5173).

**Commands** (from repo root):

```bash
npm run test:e2e                # Run all E2E tests (starts dev server if needed)
```

From `packages/frontend`:

```bash
npm run test:e2e
npm run test:e2e:ui             # Interactive UI
npm run test:e2e:headed        # Headed browser
npm run test:e2e:debug         # Debug mode
```

First-time (or CI) setup: install browsers from `packages/frontend`:

```bash
cd packages/frontend && npx playwright install --with-deps chromium
```

## Naming and layout

- **Unit**: `*.test.ts` under `tests/unit/` (e.g. `services/SessionService.test.ts`).
- **Integration**: `*.test.ts` under `tests/integration/` (e.g. `routes/auth.test.ts`).
- **E2E**: `*.spec.ts` under `tests/e2e/` (e.g. `auth-flow.spec.ts`).

Tests should focus on behavior and contracts, not implementation details.

## CI

- **Quality Gates**: lint → type-check → build → backend `test:ci` → backend `test:coverage` → npm audit (high) → upload backend coverage to Codecov.
- **E2E**: Runs after Quality Gates; installs Playwright Chromium and runs `npm run test:e2e`.

See [CI_CD.md](CI_CD.md) for the full pipeline and pre-commit hooks.
