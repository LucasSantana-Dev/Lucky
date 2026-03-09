# Lucky Current State (2026-03-08)

## Version: 2.5.0
- Branch: main
- Last commit: `e775fbd feat: v2.5.0 with backend/frontend tests and changelog`

## Test Coverage
- Backend: 462 tests, 35 suites (all passing)
- Bot: 99 tests, 10 suites (all passing)
- Frontend unit: 217 tests, 25 suites (all passing)
- Frontend E2E: 190 tests, 13 spec files + 8 new page specs

## Session Changes (2026-03-08, continued)
- Docker fix: added missing workspace package.jsons in Dockerfile + Dockerfile.frontend — all 4 images now building (bot, backend, frontend, nginx) on ghcr.io
- Last.fm OAuth hardening: validated apiKey before use, added WEBAPP_BACKEND_URL for callback
- E2E visual baseline: updated 3 stale snapshots, 190/190 passing
- Redis cache metrics: health endpoint + cache stats (another session)
- Music queue drag-and-drop: QueueList DnD reordering (another session)

## Previous Session Changes
- 8 new E2E specs (33 tests), SonarCloud integration, CI build order fix
- Structured logging migration, Map eviction, cleanupOldData() simplification
- scrobbleAndRecord() extraction

## SonarCloud Setup
- Org: `lucassantana-dev`, Project: `LucasSantana-Dev_NexusBot`
- Config: `sonar-project.properties`
- Workflow: `.github/workflows/sonarcloud.yml` (v6 action)
- Coverage: backend + bot lcov reports
- Exclusions: node_modules, dist, build, coverage, test files, generated code, public assets

## Key Files Modified
- `.github/workflows/ci.yml` — build:shared step, setup-node v6
- `.github/workflows/sonarcloud.yml` — full setup, v6 action
- `sonar-project.properties` — correct org/project keys
- `packages/shared/src/services/LyricsService.ts` — console.error → errorLog
- `packages/shared/src/utils/monitoring/sentry.ts` — console.log → infoLog
- `packages/bot/src/utils/monitoring/sentry.ts` — console.log → infoLog
- `packages/bot/src/handlers/player/trackHandlers.ts` — eviction + scrobbleAndRecord()
- `packages/shared/src/services/database/DatabaseService.ts` — cleanupOldData() simplified
- `packages/frontend/src/hooks/useAuthRedirect.ts` — removed console.error