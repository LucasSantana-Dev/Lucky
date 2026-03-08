# Known Gotchas

## Prisma 7 Custom Output
- `generator { output = "../packages/shared/src/generated/prisma" }` means `.prisma/client/default` is NOT populated
- `@prisma/client` PrismaClient type has NO model delegates — must import from generated path
- Services import: `import { Prisma } from '../generated/prisma/client.js'`
- prismaClient.ts imports: `import type { PrismaClient } from '../../generated/prisma/client.js'`
- `src/generated` must NOT be in tsconfig `exclude` array

## Prisma Json Fields
- Nullable Json columns require `Prisma.JsonNull` (not `null`)
- Returned values are `JsonValue` not `string` — use `typeof x === 'string' ? JSON.parse(x) : x`

## Jest + Generated Prisma Client (ESM)
- Generated client uses `import.meta.url` (ESM only)
- Jest runs in CJS mode via ts-jest — crashes on import.meta
- Fix: `moduleNameMapper` in `packages/backend/jest.config.cjs` stubs `generated/prisma/client` → `tests/__mocks__/prismaClient.ts`
- Mock exports minimal `Prisma = { JsonNull: 'DbNull' }`

## Express 5
- `req.query` and `req.params` are read-only (getter/setter) — cannot reassign in middleware
- Fixed in validateParams (commit 4d75605)

## Docker Build
- Prisma generate needs correct output path in multi-stage build
- Backend needs tsup ESM build (commit 61fcb45)

## Pre-commit Hooks
- `npm audit --audit-level=critical` can fail on transitive deps — use `HUSKY=0` for non-code commits
- commitlint enforces lowercase subject after colon

## Dead Code
- `prismaHelpers.ts` (typePrisma/TypedPrisma) — no longer imported by services
- Test mocks still reference it (`jest.mock('@nexus/shared/utils/database/prismaHelpers')`) — harmless but prevents deletion
