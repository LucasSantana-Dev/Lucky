# Next Priorities (2026-03-08)

## Completed (Sessions 15-18)
- ✅ Prisma type cleanup — removed all typePrisma workarounds
- ✅ Guild settings + module settings API routes
- ✅ Dead code cleanup (prismaHelpers.ts)
- ✅ Version bumps v2.1.0, v2.2.0
- ✅ Missing API routes — trackHistory, twitch, lyrics, roles (4 files, 21 tests)
- ✅ Manual Prisma type replacement — 5 services cleaned
- ✅ Frontend SSE — already implemented for music; CRUD data doesn't need SSE
- ✅ Track History page — stats cards, ranking charts, recent tracks
- ✅ Twitch Notifications page — CRUD with purple theme
- ✅ Jest forceExit fix — removed flag, tests exit clean (code 0)
- ✅ tsc build switch — bot/backend use tsc + add-js-extensions.js

## Completed (Session 19-20)
- ✅ Redis caching — automod, modsettings, custom commands (read-through, 5min TTL)
- ✅ Frontend tests — TrackHistory + TwitchNotifications pages
- ✅ E2E fix — 135/135 passing, visual snapshots updated
- ✅ Bot startup fixes — command loader (.js preference), ready event race condition, guild-only registration
- ✅ /play command fix — creates queue via `createQueue`+`queueConnect` instead of `requireQueue`

## Completed (Session 21-22)
- ✅ Dependabot triage — auto-merged 5 docker action bumps
- ✅ E2E expansion — 8 new spec files, 33 tests (moderation, commands, automod, music, config, settings, logs, automessages)
- ✅ SonarCloud setup — project created, workflow v6, secrets, correct org key
- ✅ Code quality — structured logging, Map eviction, cleanupOldData() simplification, scrobble dedup
- ✅ CI fix — build:shared before type-check
- ✅ Frontend test coverage — 8 page specs added (was priority #7)

## Completed (Session 26 continued)
- ✅ Docker build fix — all 4 images building on ghcr.io (bot, backend, frontend, nginx)
- ✅ Last.fm OAuth hardening — apiKey validation, WEBAPP_BACKEND_URL callback
- ✅ E2E visual baseline — 3 snapshots updated, 190/190 passing
- ✅ DNS verified — lucky.lucassantana.tech → 172.67.145.91 / 104.21.55.61

## Remaining Work
1. **Homelab webhook server**: Deploy webhook returns 405 — nginx needs POST endpoint config
2. **Music player live testing**: Docker images built, needs actual deploy + Discord voice test
3. **SonarCloud monitoring**: First scan clean (0 issues) — keep monitoring
4. **WEBAPP_BACKEND_URL env var**: Add to .env.production on homelab for OAuth callbacks