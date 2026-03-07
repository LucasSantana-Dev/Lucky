# Nexus - Project Guide

## Overview
All-in-one Discord bot platform with web dashboard. Music, moderation, auto-mod, custom commands, feature toggles, and server management — TypeScript monorepo with 4 packages.

## Architecture
```
packages/
  shared/    # Types, services, config, Prisma client (base dependency)
  bot/       # Discord.js 14 bot (slash commands, events, music)
  backend/   # Express 5 API server (auth, routes, sessions)
  frontend/  # React 19 + Vite dashboard (Tailwind 4, shadcn/ui, Zustand)
```

**Build order**: shared -> bot | backend | frontend (parallel)

## Stack
- Runtime: Node.js 22, TypeScript 5.9 (strict)
- Bot: Discord.js 14.25, Discord Player 7.1
- Backend: Express 5.2, Prisma 7.4, Redis (ioredis)
- Frontend: React 19, React Router 7, TanStack Query 5, Zustand 5, Tailwind 4
- Testing: Jest 30 (backend), Playwright 1.57 (E2E)
- Build: tsup (bot), tsc (shared/backend), Vite 7 (frontend)
- Infra: Docker (postgres + redis + nginx), Cloudflare Tunnel

## Code Standards
- Functions: <50 lines, cyclomatic complexity <10
- No `any` types (ESLint error level)
- Conventional commits: feat, fix, refactor, chore, docs, style, ci, test
- Prettier: no semicolons, single quotes, 4-space indent, 80 char width
- Files: <250 lines (enforced)

## Feature Flags
Two-tier system: Unleash (optional) -> env vars (`FEATURE_<NAME>=true|false`) -> defaults
Flags defined in: `packages/shared/src/config/featureToggles.ts`
Types in: `packages/shared/src/types/featureToggle.ts`
Service: `packages/shared/src/services/FeatureToggleService.ts`

## Key Patterns
- **Command structure**: `packages/bot/src/functions/<category>/commands/<name>.ts`
- **Handler split**: Handlers in `<category>/handlers/`, commands import from handlers
- **Service layer**: Business logic in `packages/shared/src/services/`
- **Auth**: Discord OAuth via backend, session in Redis, Zustand store in frontend
- **Route handlers**: `asyncHandler` wrapper + `throw AppError.xxx()` (no manual try/catch)
- **Validation**: Zod schemas in `backend/src/schemas/`, applied via `validateBody`/`validateParams`/`validateQuery`
- **Error flow**: Route throws AppError → errorHandler returns typed JSON. Unknown errors → 500 + log
- **Frontend errors**: Axios interceptor creates `ApiError` with status + details from backend
- **Rate limiting**: `apiLimiter` (100/min), `authLimiter` (20/15min), `writeLimiter` (30/min)

## Testing
- Backend: `npm run test --workspace=packages/backend` (362 tests, 24 suites)
- Coverage: statements 96%, branches 84%, functions 100%, lines 96%
- Frontend: `npm run test --workspace=packages/frontend` (30 tests, 4 suites, Vitest)
- E2E: `npm run test:e2e` (Playwright, no tests written yet)

## Database
- Prisma schema: `prisma/schema.prisma` (root level, shared across packages)
- Generate: `npm run db:generate`
- Migrate: `npm run db:migrate`

## Gotchas
- Pre-commit runs `npm audit --audit-level=critical` which fails on transitive deps. Use `HUSKY=0` for non-code commits
- `packages/shared` must build first (`npm run build:shared`) before other packages
- node_modules/.bin permissions may need `chmod +x` after fresh `npm ci`
- Frontend uses path alias `@/` mapped to `src/`
- Express 5: `req.query` is read-only (getter/setter) — cannot reassign in middleware
- `packages/backend/src/public/` contains frontend build artifacts (not source code)

## Docker
- `docker-compose.yml`: Production (postgres + redis + bot + backend + frontend + nginx)
- `docker-compose.dev.yml`: Development with hot reload
- Nginx proxies `/api/*` -> backend:3000, `/` -> frontend:80
