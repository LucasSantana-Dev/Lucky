---
name: backend-express
description: Work with LukBot backend (Express API). Use when editing packages/backend, routes, middleware, or backend services.
---

# LukBot Backend (Express)

## When to use

- Editing `packages/backend` — routes, middleware, services
- Adding or changing API endpoints, auth, or session handling
- Backend tests or integration with shared services

## Structure

- **Entry**: `packages/backend/src/server.ts` → `index.ts`
- **Routes**: `packages/backend/src/routes/` (auth, guilds, toggles, lastfm, index)
- **Middleware**: `packages/backend/src/middleware/` (auth, session)
- **Services**: `packages/backend/src/services/` (DiscordOAuthService, GuildService, SessionService, LastFmAuthService)

## Conventions

- Use shared config and env from `@lukbot/shared` when needed.
- Auth: Discord OAuth; session in middleware and SessionService. No hardcoded secrets.
- Responses: consistent JSON; appropriate HTTP status codes; no stack traces or secrets in responses.
- Tests: `packages/backend/tests/` — unit under `unit/`, integration under `integration/`.

## Nginx

- `/api/*` is proxied to backend. API base path is `/api` from frontend.

## Commands

- Dev: `npm run dev:backend`
- Build: `npm run build` (shared → backend)
- Tests: `npm run test` (or package-level)

## MCP

- **user-Context7**: Express, Node, TypeScript docs
- **user-sequential-thinking**: Multi-step API or auth design
