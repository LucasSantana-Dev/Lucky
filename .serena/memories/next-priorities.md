# LukBot — Next Priorities

Last updated: 2026-03-07 (Session 6)

## Completed

1. ✅ Zod input validation + rate limiting on all routes
2. ✅ Centralized error handling (AppError, asyncHandler, errorHandler)
3. ✅ Frontend API alignment (ApiError, method/path fixes)
4. ✅ CI hardening, README modernization
5. ✅ Music route refactoring (asyncHandler + AppError)
6. ✅ Backend coverage: 96% stmts, 84% branches, 100% functions
7. ✅ Frontend unit tests: 30 tests, 4 suites (Vitest)
8. ✅ Express 5 type fixes: p() helper
9. ✅ AutoMod mute action with Discord timeout + moderation case tracking
10. ✅ Session persistence (file-based, survives restarts)
11. ✅ E2E tests: 135/135 passing (Playwright)
12. ✅ Design tokens: 30+ broken Tailwind classes fixed
13. ✅ Bundle optimization: 756→409 KB, 31 unused deps removed

## Next Priorities (Recommended Order)

### Priority 1: Security Vulnerabilities
- 26 vulnerabilities (6 critical, 6 high) from discord-player-youtubei
- Run `npm audit fix` and check for dependency updates

### Priority 2: CI/CD Pipeline
- No GitHub Actions workflows yet
- Add: lint + build + test on PR, deploy on merge

### Priority 3: Frontend Component Tests
- 30 unit tests but no component-level tests
- Key targets: Sidebar, ServerCard, Login page, Config forms

### Priority 4: Redis Session Upgrade
- File-based sessions work but Redis is faster for production
- Graceful fallback already in place — just needs Redis connection

### Priority 5: Code Splitting Config Page
- Config chunk is 118 KB — largest page chunk
- Could lazy-load sub-configs (MusicConfig, ModerationConfig)
