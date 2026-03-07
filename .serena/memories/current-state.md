# Nexus — Current State

Last updated: 2026-03-07 (Session 11 — Prisma 7, Zero Vulns, Repo Rename)

## GitHub
- **Repo**: `LucasSantana-Dev/Nexus` (renamed from LukBot)
- **0 open PRs, 0 open issues**
- All dependabot PRs resolved (#110-113 closed, #66 closed, #111 closed)

## Build Status

| Package  | Status    | Notes                                    |
| -------- | --------- | ---------------------------------------- |
| shared   | ✅ Builds | Prisma 7.4.2 with @prisma/adapter-pg    |
| bot      | ✅ Builds | @discord-player/extractor added          |
| frontend | ✅ Builds | No warnings, optimized bundle            |
| backend  | ✅ Builds | Tests excluded from tsc, named RedisStore |
| backend tests | ✅ 364/364 | 24 suites, Jest 30                  |
| frontend tests | ✅ 60/60 | 8 suites, Vitest                    |
| E2E tests | ✅ 135/135 | 15 spec files, Playwright             |

## Security
- **0 vulnerabilities** (npm overrides: @smithy, @hono, lodash + audit fix)

## Prisma 7.4.2
- Provider: `prisma-client` with `engineType = "client"`
- Output: `../packages/shared/src/generated/prisma`
- `prisma.config.ts` for CLI datasource URL
- `@prisma/adapter-pg` driver adapter in PrismaClient constructor

## Frontend Bundle

| Chunk         | Size (gzip) |
| ------------- | ----------- |
| index.js      | 119 KB      |
| vendor-ui     | 65 KB       |
| vendor-radix  | 34 KB       |
| vendor-state  | 28 KB       |
| vendor-react  | 23 KB       |

Dependencies: 27 (down from 58).

## Logo & Branding
- `assets/nexus-logo.svg` — horizontal icon + wordmark
- `assets/nexus-logo.png` — canvas art
- `packages/frontend/public/favicon.svg` — hexagonal hub icon
- All LukBot references removed (scripts, Dockerfile, .cursor/rules)

## Deploy
- `deploy.yml`: configurable via `DEPLOY_PATH` secret, defaults `/opt/nexus`

## CI/CD
- `npm ci --legacy-peer-deps` required
- Lint + type-check + build + backend tests + frontend tests + security
