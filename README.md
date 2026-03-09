<p align="center">
  <img src="assets/lucky-mascot/outline-v4-neon.jpeg" alt="Lucky" width="320" />
</p>

<p align="center">
  All-in-one Discord bot platform with web dashboard.<br/>
  Music, moderation, auto-mod, custom commands, feature toggles, and server management.
</p>

[![Node.js](https://img.shields.io/badge/Node.js-22.x-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![Discord.js](https://img.shields.io/badge/Discord.js-14.25-purple.svg)](https://discord.js.org/)
[![License](https://img.shields.io/badge/License-ISC-yellow.svg)](LICENSE)
[![CI](https://github.com/LucasSantana-Dev/Lucky/actions/workflows/ci.yml/badge.svg)](https://github.com/LucasSantana-Dev/Lucky/actions/workflows/ci.yml)

## Architecture

```
packages/
  shared/      # Types, services, config, Prisma client (base dependency)
  bot/         # Discord.js 14 bot (slash commands, events, music)
  backend/     # Express 5 API server (auth, routes, sessions)
  frontend/    # React 19 + Vite dashboard (Tailwind 4, shadcn/ui, Zustand)
```

**Build order**: shared → bot | backend | frontend (parallel)

### Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 22, TypeScript 5.9 (strict) |
| Bot | Discord.js 14, Discord Player 7.1, FFmpeg, yt-dlp |
| Backend | Express 5, Prisma 7, Redis (ioredis) |
| Frontend | React 19, React Router 7, TanStack Query 5, Zustand 5, Tailwind 4 |
| Testing | Jest 30 (backend), Vitest (frontend, 200 tests), Playwright (E2E, 194 tests) |
| Build | tsup (bot), tsc (shared/backend), Vite 7 (frontend) |
| Infra | Docker (postgres + redis + nginx), Cloudflare Tunnel |

### Design System
- Main colors:
  - Lucky Purple (primary): `#8b5cf6`
  - Lucky Gold (accent): `#d4a017`
- Brand palette: purple-dominant surfaces with gold highlights.
- Typography:
  - Display: `Sora`
  - Body/UI: `Manrope`
  - Mono/technical: `JetBrains Mono`
- Domain-based dashboard IA (paths preserved):
  - Overview: `/`, `/servers`
  - Server: `/settings`, `/config`
  - Moderation: `/moderation`, `/automod`, `/logs`
  - Automation: `/features`, `/commands`, `/automessages`
  - Music: `/music`, `/music/history`, `/lyrics`
  - Integrations: `/lastfm`, `/twitch`

## Features

### Bot
- Multi-platform music (YouTube, Spotify) with queue, shuffle, repeat, lyrics, autoplay
- Now-playing card updates in place to avoid channel spam on track changes
- Video/audio downloads with format selection and progress tracking
- Moderation: warn, mute, kick, ban with case tracking
- Auto-mod: word filter, link filter, spam detection
- Custom commands, embed builder, auto-messages (welcome/leave)
- Reaction roles, role management
- Twitch stream notifications (EventSub WebSocket)
- Last.fm scrobbling integration

### Dashboard
- Discord OAuth authentication
- Domain navigation shell with responsive sidebar, top context rail, and typed route metadata
- Guild management with bot status
- Server settings and configuration pages
- Modules catalog with category grouping, tier badges, and per-module toggles/settings
- Advanced module controls with status filters and sorting presets
- Command categories with bulk enable/disable and per-command toggles
- Command view-level bulk actions for visible results plus command capability badges
- Command category matrix rail with grouped command sections for denser admin workflows
- Moderation case viewer and settings
- Auto-mod configuration
- Server logs with tab categories, backend pagination metadata, and date-range filters
- Log quick-range presets (`Last 24h`, `Last 7d`, `Last 30d`) and event-type visual labels
- Server listing management (description, invite defaults, language, categories/tags, social links)
- Server listing live preview panel with reset/save guardrails
- Professionalized admin visual language (less decorative chrome, stronger hierarchy, denser controls) across Modules, Commands, Logs, and Server Listing
- Refined global shell tokens for a cleaner production style (subtle background depth, reduced blur/glow, tighter cards/buttons)
- Unified visual treatment for Dashboard, Features, Config, and Moderation pages to match the updated admin control surfaces
- OAuth login now resolves Discord auth URLs from current request origin/host fallback to reduce stale-domain redirect failures in production
- Backend startup fails in production (warns in non-production) if legacy `nexus.lucassantana.tech` values are present in OAuth frontend/redirect environment variables
- Login view now displays inline OAuth error diagnostics to support faster incident triage
- Health API includes OAuth config inspection at `/api/health/auth-config`
- Automation pages for feature toggles and auto messages
- Music player with real-time SSE updates
- Feature toggle management (Unleash + env var fallback)

### Backend Quality
- Zod input validation on all routes
- Rate limiting (API 100/min, auth 20/15min, write 30/min)
- Centralized error handling (AppError + asyncHandler + errorHandler)
- Request logging middleware
- Backend has 400+ tests with high coverage; frontend quality gates include
  200 Vitest tests and 194 Playwright E2E tests

## Quick Start

### Prerequisites
- Node.js 22+, FFmpeg, Discord Bot Token
- PostgreSQL + Redis (or use Docker)

### Setup

```bash
git clone https://github.com/LucasSantana-Dev/Lucky.git
cd Lucky
cp .env.example .env    # Configure DISCORD_TOKEN, CLIENT_ID, DATABASE_URL
npm install
npm run build
npm start
```

### Docker (Recommended)

```bash
cp .env.example .env    # Add credentials
docker compose up -d    # Starts postgres, redis, bot, backend, frontend, nginx
docker compose logs -f  # View logs
```

### Development

```bash
npm run dev:bot         # Bot with hot reload
npm run dev:backend     # Backend with hot reload
npm run dev:frontend    # Vite dev server

npm run lint            # ESLint
npm run type:check      # TypeScript validation
npm run test            # Backend tests (Jest)
npm run test:coverage   # With coverage report
npm run format          # Prettier

# Frontend-only quality gates
npm run lint --workspace=packages/frontend
npm run type:check --workspace=packages/frontend
npm run test --workspace=packages/frontend
npm run test:e2e --workspace=packages/frontend
```

Backend dev startup now loads root `.env` before module initialization, so
`DATABASE_URL` and related vars are available without manual export.

### Remote Deploy (No SSH)

```bash
./scripts/deploy-remote.sh main
# or
npm run deploy:homelab
```

Triggers the GitHub `Deploy to Homelab` workflow, waits for completion, and shows failed logs.
After webhook rollout, the workflow runs an OAuth smoke gate against
`/api/health/auth-config` and fails if auth config is degraded (warnings, legacy domain,
or non-`ok` status).

Vercel note: `vercel.json` runs `npm run db:generate` before `build:shared` and `build:frontend` to ensure Prisma generated client files are present during cloud builds.

## Environment Variables

See `.env.example` for all available options. Key variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `DISCORD_TOKEN` | Yes | Discord bot token |
| `CLIENT_ID` | Yes | Discord application client ID |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `REDIS_HOST` | No | Redis host (default: localhost) |
| `WEBAPP_ENABLED` | No | Enable web dashboard (default: false) |
| `WEBAPP_SESSION_SECRET` | No | Session encryption key |
| `CLIENT_SECRET` | No | Discord OAuth secret (for dashboard) |
| `SENTRY_DSN` | No | Error tracking |

### Feature Toggles

Two-tier system: Unleash (optional) → env vars (`FEATURE_<NAME>=true|false`) → defaults.

Set `UNLEASH_URL` and `UNLEASH_API_TOKEN` for Unleash, or use `FEATURE_DOWNLOAD_VIDEO=true` style env vars.

## Documentation

- [Architecture](docs/ARCHITECTURE.md) — Package layout, entry points, adding new code
- [CI/CD](docs/CI_CD.md) — Pipeline, pre-commit hooks, deploy workflow
- [Testing](docs/TESTING.md) — Strategy, running tests, coverage
- [Docker Setup](docs/WEBAPP_SETUP.md) — Web app configuration
- [Cloudflare Tunnel](docs/CLOUDFLARE_TUNNEL_SETUP.md) — HTTPS without open ports
- [Twitch Setup](docs/TWITCH_SETUP.md) — Stream notification credentials
- [Last.fm Setup](docs/LASTFM_SETUP.md) — Scrobbling configuration

## Slash Commands

### Music
`/play` `/pause` `/resume` `/skip` `/stop` `/queue` `/volume` `/seek` `/lyrics` `/shuffle` `/repeat` `/clear` `/remove` `/move` `/jump` `/history` `/songinfo` `/autoplay`

### Download
`/download` `/download-audio` `/download-video`

### General
`/ping` `/help` `/exit`

### Twitch
`/twitch add` `/twitch remove` `/twitch list`

## Contributing

1. Fork and create a feature branch
2. Follow conventional commits (`feat:`, `fix:`, `refactor:`, etc.)
3. Run `npm run lint && npm run type:check && npm run test` before PR
4. Keep functions <50 lines, files <250 lines

## License

ISC
