# LukBot Current State (2026-03-08)

## Version: 2.3.0
- Branch: main
- Last commit: `0c1a746 feat: add comprehensive test coverage and bump to v2.3.0`

## Test Coverage
- Backend: 435 tests, 33 suites (all passing)
- Frontend unit: 197 tests, 23 suites (all passing)
- Frontend E2E: 22 new tests (lyrics, track-history, twitch-notifications) + existing
- Redis caching: 14 tests (cache hit/miss/invalidation for CustomCommandService + ModerationSettings)

## Recent Changes (v2.3.0)
- 32 backend integration tests for music routes (playback, queue, state)
- 14 Redis caching integration tests
- 22 E2E Playwright tests for new pages
- Fixed TS2345 in test setup (Jest 30 typing)
- playerFactory updated with yt-dlp streaming fallback

## Key Gotchas Discovered
- express-session mock in setup.ts only sets `req.sessionID` from cookie headers — tests must use `.set('Cookie', ['sessionId=valid_session_id'])` for authed requests
- SSE endpoints (text/event-stream) don't work with supertest's request-response model
- Backend tests must run from `packages/backend` directory for `diagnostics: false` to work
- Redis caching tests use `@nexus/shared/services/CustomCommandService` import path (moduleNameMapper) to bypass setup.ts global mock

## Bot Test Infrastructure (NEW — Session 22)
- Jest 30 + ts-jest configured for bot package
- 99 tests, 10 suites, all passing (~7s)
- Covers: trackSimilarity, similarityChecker, titleComparison, ytdlpExtractor, commandValidations, stringUtils, playerFactory, Command model, health, metrics
- Mock factories: discord.ts (User/Guild/VoiceChannel/Member/Interaction), discordPlayer.ts (Track/Queue)
- Run: `npm run test --workspace=packages/bot`

## Unstaged Files
- `packages/bot/jest.config.cjs`, `packages/bot/tests/` — bot test infrastructure (ready to commit)