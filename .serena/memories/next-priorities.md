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

## Remaining Work
1. **Music player live testing**: Bot running, /play fixed — needs user to test in Discord voice channel
2. **Commit bot fixes**: play/index.ts, service.ts, getCommandsFromDirectory.ts, docker-compose.dev.yml, Dockerfile.frontend
3. **Docker deploy verification**: Build + deploy to homelab, verify all services healthy
4. **Verify DNS propagation**: Check `dig nexus.lucassantana.tech @1.1.1.1 +short` returns IPs
5. **Discord OAuth redirect**: Add callback URL in Discord Developer Portal
6. **Lyrics search UI**: Frontend page for /api/lyrics endpoint (low priority)
7. **Frontend test coverage**: More page tests (Moderation, AutoMod, CustomCommands)
