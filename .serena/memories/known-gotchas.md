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
- Prisma generated client must be at BOTH src/generated/ AND dist/generated/
- chalk v5 ESM + unleash-client must be in ROOT package.json deps (workspace hoisting bug)
- Dockerfile.frontend: --legacy-peer-deps needed (eslint-plugin-react-hooks caps at eslint@^9)
- `docker compose --profile tunnel up -d` rebuilds ALL services — use `docker start nexus-tunnel`
- Cloudflare cert.pem (from `cloudflared login`) only has tunnel permissions, NOT DNS write
- Express 5 wildcard routes: `/{*path}` not `*`
- nginx caches upstream DNS — restart nginx after backend rebuild

## Pre-commit Hooks
- `npm audit --audit-level=critical` can fail on transitive deps — use `HUSKY=0` for non-code commits
- commitlint enforces lowercase subject after colon

## Bot Startup
- **LOG_LEVEL env var**: 0=ERROR, 1=WARN, 2=INFO, 3=SUCCESS, 4=DEBUG. Default in .env is 1 (WARN) — suppresses info/debug. Override with LOG_LEVEL=4 for debugging
- **Command loader**: `getCommandFiles()` must prefer `.js` over `.ts` — `dist/` only has `.js` files. NODE_ENV-based filtering breaks it
- **Ready event**: Must attach `client.once('ready')` BEFORE `client.login()` and wrap in Promise — event can fire during login
- **Command registration**: Use guild-only (`applicationGuildCommands`) — global commands take 1h to propagate and cause duplicates
- **Discord-player queue**: `/play` must CREATE queue via `player.nodes.create()` (idempotent). Other commands use `player.nodes.get()` to require existing queue
- **Postgres port**: Dev compose maps 5433:5432 to avoid SSH tunnel conflicts on port 5432

## Frontend Test Gotchas
- Skeleton: `.animate-pulse` class, NO data-testid — use `document.querySelectorAll('.animate-pulse')`
- CSS `uppercase`: doesn't affect DOM text — match original case ("Music" not "MUSIC")
- Radix Select: jsdom lacks pointer events — skip in unit tests, cover via Playwright E2E
- `vi.useFakeTimers()`: breaks React `waitFor` — use real timers with longer timeout
- Duplicate text (nav + heading): use `getAllByText` with length assertion
- Guild name in paragraph: use regex matcher not exact string match
- Twitch credentials: placeholder values in .env were expired — must complete full OAuth flow

## Dead Code
- `prismaHelpers.ts` (typePrisma/TypedPrisma) — no longer imported by services
- Test mocks still reference it (`jest.mock('@nexus/shared/utils/database/prismaHelpers')`) — harmless but prevents deletion
