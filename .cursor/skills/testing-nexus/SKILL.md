---
name: testing-nexus
description: Write and fix tests in Nexus. Use when adding unit tests, fixing disabled tests, or understanding Jest ESM mock patterns specific to this project.
---

# Nexus Testing

## When to use

- Writing new unit tests for shared services
- Fixing disabled tests (`return` in `beforeAll` that skips the suite)
- Understanding why a mock isn't working or a module can't be resolved
- Adding integration tests for Express routes

## Test locations

- **Unit tests**: `packages/backend/tests/unit/services/` and `packages/backend/tests/unit/middleware/`
- **Integration tests**: `packages/backend/tests/integration/`
- **Config**: `jest.config.cjs` at repo root; setup file: `packages/backend/tests/setup.ts`
- **Runner**: `npm run test` (or `npx jest` from repo root)

Tests run from `packages/backend/` roots only. Bot package tests do not exist yet.

## Jest config key facts

- Preset: `ts-jest` (not Vitest, not native ESM)
- `moduleNameMapper` maps `@nexus/shared/services` → `packages/shared/src/services/index.ts`
- `transformIgnorePatterns` allows `chalk`, `uuid`, and `@nexus` through transform
- Coverage threshold: 70% for branches, functions, lines, statements
- `clearMocks`, `resetMocks`, `restoreMocks` all true — mocks reset between tests automatically
- `testTimeout`: 30000ms

## Critical: ES module mock pattern

Tests use `jest.unstable_mockModule()` (not `jest.mock()`). The service module import **must come after** mock registration, inside `beforeAll`:

```typescript
import { describe, test, expect, beforeEach, jest } from '@jest/globals'

const mockPrisma: any = {
    myModel: {
        findUnique: jest.fn(),
        create: jest.fn(),
        upsert: jest.fn(),
    },
}

// Must come BEFORE the import, at top level
jest.unstable_mockModule('@nexus/shared/utils/database/prismaClient', () => ({
    getPrismaClient: () => mockPrisma,
    prisma: mockPrisma,
}))

let MyService: typeof import('@nexus/shared/services').MyService

beforeAll(async () => {
    const module = await import('@nexus/shared/services')
    MyService = module.MyService
})
```

Then in `beforeEach`:

```typescript
beforeEach(() => {
    jest.clearAllMocks()
    service = new MyService()
})
```

## Fixing disabled tests

Tests are disabled by an early `return` at the top of `beforeAll`:

```typescript
beforeAll(async () => {
    return  // ← remove this line
    const module = await import(...)
```

To re-enable: remove the `return` line. Then:

1. Ensure the service actually exists and is exported from `packages/shared/src/services/index.ts`
2. Ensure method signatures in the service match what the tests call
3. Run `npm run test` to verify

Currently disabled (as of 2026-03-06):

- `AutoModService.test.ts` — service signature mismatch (use **moderation-automod** skill to fix)
- `EmbedBuilderService.test.ts` — check if service export is now present; re-enable if so

## Writing a new service test

1. Copy the mock setup pattern above
2. Only mock `@nexus/shared/utils/database/prismaClient` (and Redis if needed)
3. Test the public service API — not Prisma internals
4. Use realistic Discord snowflake IDs as constants (18-digit strings)
5. Keep each `describe` block scoped to one service method
6. Assert both happy paths and error/null cases

## Mock Redis (when needed)

```typescript
const mockRedis: any = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    setex: jest.fn(),
}

jest.unstable_mockModule('@nexus/shared/services/redis', () => ({
    redisClient: mockRedis,
}))
```

## Common mistakes

| Mistake                                               | Fix                                                        |
| ----------------------------------------------------- | ---------------------------------------------------------- |
| `jest.mock()` instead of `jest.unstable_mockModule()` | Use `jest.unstable_mockModule()`                           |
| Importing service at top level (before mock)          | Move import into `beforeAll`                               |
| Using `fail('message')`                               | Use `throw new Error('message')` — `fail` is not available |
| Checking mock call count without `clearMocks`         | Already handled by jest config; no need to call manually   |
| Importing `@nexus/shared` (root) instead of subpath   | Use `@nexus/shared/services` to get module mapper          |

## Integration test pattern

```typescript
import request from 'supertest'
import app from '../../src/server.js'

describe('GET /api/guilds', () => {
    test('returns 401 without session', async () => {
        const res = await request(app).get('/api/guilds')
        expect(res.status).toBe(401)
    })
})
```

## Coverage

Running with coverage: `npx jest --coverage`. Target 70% across branches/lines/functions. Focus coverage on service logic, not trivial getters/constructors.
