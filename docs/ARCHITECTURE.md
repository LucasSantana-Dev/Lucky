# LukBot Architecture

**Quick reference:** [Package structure](#package-structure) · [Where to add code](#package-layouts) · [Command loading (bot)](#command-loading-bot) · [Building](#building) · [Dependencies](DEPENDENCIES.md)

## Overview

LukBot is structured as a modular monolith with clear separation of concerns across multiple packages. **Production runs only `packages/bot` (Discord bot) and `packages/backend` (Express API).** There is no root `src/` entry point; all runtime code lives in packages.

## Entry points

| Package   | Entry file              | Role |
|-----------|-------------------------|------|
| **bot**   | `packages/bot/src/index.ts` | Ensures env, error handlers, Sentry; then `initializeBot()` from `bot/start`. |
| **backend** | `packages/backend/src/index.ts` | Ensures env, error handlers, Sentry; then `startWebApp()` from `server.ts`. |
| **frontend** | `packages/frontend/src/main.tsx` (Vite) | React app entry. |
| **shared** | No process entry | Consumed by bot and backend via `@lukbot/shared`. |

## Stack decisions

- **Backend**: Express (Node.js). NestJS is not used; the existing Express API in `packages/backend` is sufficient and avoids the extra structure and migration cost of NestJS.
- **Database**: PostgreSQL with Prisma (schema in repo root; shared client via `@lukbot/shared`). Supabase is not used for the bot or backend; Prisma + Postgres keeps one source of truth and avoids splitting data between Supabase and the bot. Supabase can be considered later only if a separate product (e.g. a Next.js app with its own auth/RLS) needs it.

## Package Structure

```
packages/
├── shared/      # Shared code (config, services, utils, types)
├── bot/         # Discord bot application
├── backend/     # Express API server
└── frontend/    # React web application
```

## Package Dependencies

- **shared**: No dependencies on other packages (base package). Single source for database (Prisma), Redis, feature toggles, reaction roles, Twitch notifications, track history, guild settings.
- **bot**: Depends on `@lukbot/shared` only. Commands and music logic live in `packages/bot`; add new commands there.
- **backend**: Depends on `@lukbot/shared` only. API routes and auth live in `packages/backend`; add new API routes there.
- **frontend**: Independent (React application)

## Communication

- **Bot ↔ Backend**: HTTP API calls (when needed)
- **Frontend ↔ Backend**: HTTP API via Nginx proxy
- **All ↔ Database/Redis**: Direct access via shared services

## Nginx Routing

The nginx container listens on port 80 and proxies to backend and frontend. In docker-compose, nginx is exposed as **8080** on the host so the app is available at `http://localhost:8080`.

- **`/api`** and **`/api/*`** → Backend (backend:3000)
- **`/`** (everything else) → Frontend (frontend:80)

Config: `nginx/nginx.conf`.

## Docker Services

| Service   | Role |
|-----------|------|
| **postgres** | PostgreSQL database |
| **redis** | Redis cache |
| **bot** | Discord bot (uses shared, Prisma, Redis) |
| **backend** | Express API (port 3000; uses shared, Prisma, Redis) |
| **frontend** | React app served by Nginx (port 80 inside container) |
| **nginx** | Reverse proxy (port 80; host 8080) |

## Development

Each package can be developed independently:
- `npm run dev:bot` - Start bot in watch mode
- `npm run dev:backend` - Start backend in watch mode
- `npm run dev:frontend` - Start frontend dev server

## Project structure and conventions

### Root layout

- **packages/** – All runtime code (shared, bot, backend, frontend).
- **prisma/** – Schema and migrations (single source of truth; shared via `@lukbot/shared`).
- **docs/** – Setup guides, architecture, and feature docs.
- **scripts/** – Shell scripts (discord-bot.sh, setup-database.sh, etc.).
- **cloudflared/** – Tunnel config example (see [CLOUDFLARE_TUNNEL_SETUP.md](CLOUDFLARE_TUNNEL_SETUP.md)).
- **nginx/** – Nginx config for production proxy.
- No root `src/`; entry points are in each package.

### Package layouts

| Package   | Layout | Where to add |
|----------|--------|---------------|
| **shared** | `src/config/`, `src/services/`, `src/types/`, `src/utils/` | New config in config/; new services in services/; shared types in types/; composables and helpers in utils/. |
| **bot**    | `src/functions/{general,music,download}/commands/`, `src/handlers/`, `src/utils/`, `src/services/`, `src/events/` | New slash command: add file under `functions/<category>/commands/` or folder + re-export (see command loading below). Handlers, utils, and services by domain. |
| **backend**| `src/routes/`, `src/services/`, `src/middleware/` | New API: route in routes/, logic in services/. |
| **frontend** | `src/components/`, `src/pages/`, `src/hooks/`, `src/stores/`, `src/services/` | New page in pages/; shared UI in components/; API client in services/. |

### Command loading (bot)

Commands are loaded by scanning **top-level** `.ts`/`.js` files in each `functions/<category>/commands/` directory. So:

- **Single-file command**: Add `commands/foo.ts` that exports a Command (default or named `command`). It is loaded automatically.
- **Multi-file command**: Use a folder (e.g. `commands/queue/`) with an `index.ts` that exports the Command. Add a **re-export file** `commands/queue.ts` that does `export { default } from './queue/index'` so the loader sees a top-level `queue.ts` and loads it.

Keep one re-export per folder command; name the re-export file to match the command name (e.g. `queue.ts` for the queue command).

### Principles for maintainability

1. **Consistency over perfection** – Follow the same pattern in each area (e.g. all music commands either single-file or folder + re-export). Document the rule; don’t mix styles without reason.
2. **Shallow where possible** – Prefer flat or one level of nesting for new code. Deeper trees (e.g. `play/`, `queue/`, download utils) exist where the feature needs many files; don’t add layers (e.g. extra “domain” folders) unless there’s a clear benefit.
3. **One place for cross-cutting concerns** – DB, Redis, config, and shared types live in `@lukbot/shared`. Bot-only helpers stay in `packages/bot/src/utils/` or under the feature.
4. **Avoid big restructures** – Prefer small, incremental improvements when touching code. Don’t rename large trees or split packages for structure alone.
5. **Path aliases** – `packages/bot/tsconfig.json` already has `@/*` → `./src/*`, so you can use `@/utils/...`, `@/handlers/...` etc. Use them in new code if you prefer; migrate old relative imports gradually.

### What not to do

- Don’t move Prisma into a package; the schema at repo root is the single source of truth.
- Don’t add extra abstraction layers (e.g. “domain”, “application”) unless a concrete problem (e.g. testing, reuse) requires it.
- Don’t create one-off scripts or throwaway docs; keep scripts and docs long-term useful (see project rules).

### Repo checklist (matches this doc)

- No `src/` at repo root; all runtime code under `packages/`.
- Prisma schema and migrations in `prisma/` at repo root; client used via `@lukbot/shared`.
- Bot commands: single-file under `functions/<category>/commands/*.ts` or folder + re-export (e.g. `queue.ts` → `queue/index.ts`).
- Backend API: routes in `packages/backend/src/routes/`, logic in `services/`.
- Nginx: `location /api` → backend:3000, `location /` → frontend:80.

## Dependencies

See [DEPENDENCIES.md](DEPENDENCIES.md) for the full dependency overview: what each package uses, what is reliable and non-deprecated, and how to upgrade without over-engineering.

## Building

Build all packages:
```bash
npm run build
```

Build individual packages:
```bash
npm run build:shared
npm run build:bot
npm run build:backend
npm run build:frontend
```
