# Nexus Known Gotchas

## Prisma 7
- **Custom output path**: `_require('../../generated/prisma/client.js')` not `@prisma/client` — Prisma 7 with custom output doesn't populate `.prisma/client/default`
- **No `url` in datasource**: Must use `prisma.config.ts` for CLI datasource URL
- **Driver adapter required**: `@prisma/adapter-pg` in PrismaClient constructor
- **Manual ModerationCase type**: `ModerationService.ts` has manual type (not Prisma-generated). Must keep in sync with schema
- **Dockerfile must run `npx prisma generate`** and copy `packages/shared/src/generated/` to production stage

## Redis / ioredis
- **Empty password = AUTH hang**: `REDIS_PASSWORD=""` sends AUTH with empty string. Config uses `|| undefined` to skip AUTH
- **lazyConnect: true** in config — `connect()` must be called explicitly
- **Port 6380 in dev**: Supabase uses 6379, Docker Redis mapped to 6380 locally
- **In Docker network**: Redis on port 6379 internally, no password needed

## Discord Bot
- **Handler import paths**: Commands in `commands/` import handlers from `../handlers/` (not `./handlers/`)
- **Option description limit**: Discord slash command option descriptions must be ≤100 chars
- **Feature flag changes require restart**: No hot-reload for env vars
- **24 commands loaded** (not 38 — some categories may have fewer than expected)
- **TrackInfo naming conflict**: Use `MusicTrackInfo` alias from `@nexus/shared/services`

## TypeScript / Build
- **Build order**: shared must build first (`npm run build:shared`)
- **typePrisma returns any**: Service method callbacks need explicit type annotations
- **commitlint**: Subject starts lowercase after prefix (e.g., `fix: resolve...` not `fix: Resolve...`)

## Express 5
- `req.params` and `req.query` are read-only (getter/setter)
- `validateParams` middleware may silently fail on assignment

## Frontend
- Path alias `@/` → `src/`
- E2E visual regression tests need `--update-snapshots` after UI changes
- E2E auth tests need running backend for OAuth callback

## Docker / Deployment
- **Node 22 LTS** in Dockerfiles (not 24 — doesn't exist yet)
- **Dockerfile.frontend** needs monorepo context (root package.json + shared types)
- **Cloudflare Tunnel** via `--profile tunnel` in docker-compose
- **NGINX_PORT** configurable via env var (default 8080)
