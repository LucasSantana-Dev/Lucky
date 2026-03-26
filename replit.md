# Lucky Bot — Replit Configuration

## Overview

Lucky Bot is an all-in-one Discord bot platform with music playback, moderation, auto-mod, custom commands, and a web dashboard. It is a TypeScript monorepo with 4 packages:

- **packages/shared** — Shared utilities, Prisma DB client, Redis client, config
- **packages/bot** — Discord.js bot (music, moderation, commands)
- **packages/backend** — Express API server (sessions, auth, REST endpoints)
- **packages/frontend** — React + Vite dashboard UI

## Architecture

- **Frontend** runs on port **5000** (Replit webview) using Vite dev server
- **Backend** runs on port **3000** (Express), proxied by Vite via `/api/*`
- **Bot** connects to Discord directly (no HTTP port)
- Frontend → Backend communication via `/api` proxy during development
- Database: PostgreSQL (via `DATABASE_URL` from Replit's built-in DB)
- Cache: Redis (optional, falls back to in-memory if unavailable)

## Workflows

- **Start application** — Frontend Vite dev server (port 5000, webview)
- **Backend** — Express API server (port 3000, console) — requires Discord secrets
- **Discord Bot** — Discord.js bot (console) — requires `DISCORD_TOKEN`

## Required Secrets

To run the Discord bot and backend, add these secrets via the Secrets tab:

| Secret | Required | Description |
|--------|----------|-------------|
| `DISCORD_TOKEN` | Yes | Bot token from Discord Developer Portal |
| `CLIENT_ID` | Yes | Application ID from Discord Developer Portal |
| `CLIENT_SECRET` | Yes | OAuth2 secret from Discord Developer Portal |
| `WEBAPP_SESSION_SECRET` | Yes (backend) | Random 64-char string for session signing |

## Setup Steps

1. Install dependencies: `npm install` (with `YOUTUBE_DL_SKIP_PYTHON_CHECK=1`)
2. Generate Prisma client: `npx prisma generate`
3. Build shared package: `npm run build --workspace=packages/shared`
4. Start frontend workflow ("Start application")
5. Add Discord secrets, then start "Backend" and "Discord Bot" workflows

## Database Notes

- **UserSession model removed** — The `UserSession` Prisma model was removed to prevent FK constraint generation issues during deployment. The `user_sessions` table still exists in the DB but is unmanaged by Prisma. No application code used this model.
- **migration_lock.toml** — Added to `prisma/migrations/` to properly signal the database provider to Prisma's migration engine.
- **pre-migrate.mjs** — `scripts/pre-migrate.mjs` ensures unique indexes on `guilds.discordId` and `users.discordId` exist before `prisma migrate deploy` runs. Call it in the run command before migrations if needed.
- **Deployment run command** — `node scripts/pre-migrate.mjs || true; npx prisma migrate deploy --config prisma/prisma.config.ts; NODE_ENV=production PORT=5000 node packages/backend/dist/index.js`

## Replit-Specific Changes

- **Node.js 22** — Upgraded from default 20 to match project requirement
- **Python 3.11** — Installed for `youtube-dl-exec` dependency
- **Vite port** changed from 5173 → **5000** with `host: '0.0.0.0'` and `allowedHosts: true`
- **CORS** updated to allow `*.replit.dev`, `*.repl.co`, and `*.replit.app` domains
- **env vars** — `YOUTUBE_DL_SKIP_PYTHON_CHECK=1`, `NODE_ENV=development`, `WEBAPP_PORT=3000`
- **DATABASE_URL** — Uses Replit's built-in PostgreSQL (pre-configured)

## UI / Design System

The frontend uses a custom design system built on Tailwind CSS with the following conventions:

- **Typography tokens** — `type-display`, `type-h1`, `type-h2`, `type-title`, `type-body-lg`, `type-body`, `type-body-sm`, `type-meta` — **always use these instead of raw Tailwind text classes**
- **Color tokens** — `lucky-text-primary/secondary/tertiary/disabled`, `lucky-accent` (gold), `lucky-brand` (purple), `lucky-bg-primary/secondary/tertiary/active`
- **Surface classes** — `surface-panel`, `surface-card`, `surface-elevated`, `surface-glass`
- **Focus ring** — `lucky-focus-visible` (replaces raw `focus:ring`)
- **Background** — `.lucky-shell` on the root div creates the radial gradient scene

### Sidebar & Layout
- **Sidebar.tsx** — includes GuildSwitcher with avatar+dropdown, section-labelled nav, user profile footer. Nav links use `<Link>` with `aria-current="page"` on active items.
- **Layout.tsx** — sticky header with `GuildChip` component showing active guild icon+name+click-to-switch. Route copy map provides per-page titles and subtitles.
- **ServerSelector.tsx** — legacy file; now re-exports GuildSwitcher (the old native `<select>` has been removed).

## Package Manager

npm with workspaces (`package-lock.json`)

## Key Scripts

```bash
# Install all packages
YOUTUBE_DL_SKIP_PYTHON_CHECK=1 npm install

# Generate Prisma client (required before building)
npx prisma generate

# Build shared package
npm run build --workspace=packages/shared

# Run database migrations
npx prisma migrate deploy

# Build everything
npm run build
```
