# Nexus Current State (2026-03-08, Session 20)

## Version
- **v2.2.0** on main
- 389 backend tests (29 suites), 197 frontend (23 suites), 135 E2E = 721 total
- 0 TS errors across shared/bot/backend/frontend
- All API routes implemented for services with HTTP-suitable interfaces

## Redis Caching (NEW — Session 19)
- **Pattern**: Read-through cache, 5-min TTL, fire-and-forget writes
- **AutoModService.getSettings()**: `automod:{guildId}` — called on every Discord message (5 checks)
- **moderationSettings.getModerationSettings()**: `modsettings:{guildId}` — permission checks
- **CustomCommandService.getCommand()**: `cmd:{guildId}:{name}` — command lookups (caches null too)
- **Guard**: `redisClient.isHealthy()` — graceful fallback to Prisma when Redis down
- **Invalidation**: cache del on create/update/delete mutations
- GuildSettingsService already Redis-only, FeatureToggleService already in-memory — no changes needed

## API Routes (12 route files)
- auth, toggles, guilds, management, moderation, lastfm, guildSettings
- trackHistory (5 endpoints), twitch (3), lyrics (1), roles (2 read-only)

## Prisma
- All services use `getPrismaClient()` directly — no manual casts remaining
- Json fields use `Prisma.InputJsonValue` cast (EmbedBuilderService)
- **Prisma 7 gotcha**: `url` removed from schema datasource — use `prisma.config.ts` for CLI, `connectionString` in PrismaClient constructor
- **Migration gotcha**: Must run from `prisma/` dir so `prisma.config.ts` resolves. Failed migrations need `prisma migrate resolve --applied` when tables exist

## Build System
- **Bot + Backend**: tsc + add-js-extensions.js (switched from tsup in session 17)
- **Shared**: tsc
- **Frontend**: Vite 7

## Frontend Pages (all lazy-loaded)
- Dashboard, ServerSettings, Features, Config
- Moderation, AutoMod, ServerLogs
- CustomCommands, AutoMessages
- Music, TrackHistory (stats cards, rankings, recent tracks list)
- TwitchNotifications (CRUD with purple theming)

## Testing
- Jest config: no forceExit needed — mocks properly prevent open handles
- Commitlint: rejects camelCase in subjects (use hyphens), header max 72 chars
- E2E: 135/135 passing — visual snapshots updated session 19
- **Frontend**: 197 tests, 23 suites (expanded session 20). 2 skipped (Radix Select — jsdom limitation)
- **Playwright gotcha**: `npx playwright test` from root picks up Jest files — must use `npm run test:e2e --workspace=packages/frontend`

## Twitch EventSub (Session 20)
- **ACTIVE** — WebSocket connected, fresh OAuth tokens in .env
- Redirect URI: http://localhost:3000/api/twitch/callback (updated in Twitch console)
- No streamers subscribed yet — use `/twitch add <username>` in Discord

## Last.fm Scrobbling
- **PRODUCTION READY** — env vars configured, per-user OAuth linking via /lastfm link
- Scrobbles on playerStart (now playing) and playerFinish/playerSkip

## Bot Fixes (Session 20)
- **Command loader**: `getCommandsFromDirectory.ts` — prefers `.js` files if available, falls back to `.ts`. Removed NODE_ENV check that broke `dist/` loading
- **Ready event race condition**: `startClient` wraps `client.once('ready')` in Promise BEFORE `client.login()`, awaits after — prevents missed events
- **Guild-only command registration**: Removed global `applicationCommands` registration — guild commands are instant, global take 1h and caused duplicates
- **/play queue creation**: Replaced `requireQueue` (which rejects null) with `createQueue` + `queueConnect` from `queueHandler.ts`. `/play` now creates the queue instead of requiring one
- **Voice channel validation**: `/play` now checks `requireVoiceChannel` before creating queue

## Local Dev
- `docker-compose.dev.yml`: postgres (5433:5432) + redis (6380:6379). Port 5433 avoids SSH tunnel conflicts
- Backend: `DATABASE_URL=...@localhost:5433/discordbot node packages/backend/dist/index.js`
- Bot: `DATABASE_URL=...@localhost:5433/discordbot LOG_LEVEL=2 node packages/bot/dist/index.js`
- Migrations: `cd prisma && DATABASE_URL=... npx prisma migrate deploy`

## Deployment
- **Server**: server-do-luk, Docker Compose, 7 containers
- **Local access**: port 8090 via nginx
- **Public access**: nexus.lucassantana.tech via Cloudflare Tunnel
- **Tunnel ID**: e2ebe498-e050-4043-8f38-9766d37732d4 (4 QUIC connections, GRU)
- **Config**: ~/.cloudflared/config-nexus.yml on server
- **DNS**: lucassantana.tech zone in Cloudflare, nameservers changed from GoDaddy — propagating
- **Dockerfile.frontend**: --legacy-peer-deps needed (ESLint 10 peer dep conflict)
- **Gotcha**: `docker compose --profile tunnel up -d` rebuilds ALL services — use `docker start nexus-tunnel`
- **Gotcha**: cert.pem from `cloudflared login` only has tunnel permissions, NOT DNS write
- Cloudflare Tunnel to nexus.lucassantana.tech
