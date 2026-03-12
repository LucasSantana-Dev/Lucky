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
| Testing | Jest 30 (backend, 462 tests), Vitest (frontend, 197 tests), Playwright (E2E, 190 tests) |
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
- Semantic UI foundation:
  - Tokens: `--lucky-surface-*`, `--lucky-text-*`, `--lucky-motion-*`,
    `--lucky-shadow-*` in `packages/frontend/src/index.css`
  - Primitives: `Shell`, `SectionHeader`, `EmptyState`, `StatTile`,
    `ActionPanel` in `packages/frontend/src/components/ui`

### Latest Release (`v2.6.10`)
- Stabilized dashboard/runtime behavior across shell routes (guild re-sync,
  RBAC-aware visibility, identity fallback chain).
- Refreshed E2E contracts and visual baselines for redesigned pages.
- Removed Deezer integration (`discord-player-deezer`) and switched Opus runtime
  to `opusscript`.
- Security override floor updates: `tar>=7.5.11`, `hono>=4.12.7`,
  `file-type>=21.3.1`.

## Features

### Bot
- Multi-platform music (YouTube, Spotify) with queue, shuffle, repeat, lyrics, autoplay
- Dynamic Discord presence rotation with live guild/member/session stats and command CTA
- Autoplay recommendations use anti-repeat filtering with queue buffering so shuffle stays useful during autoplay
- Autoplay command recovers active guild queue from player cache fallback to avoid false queue-missing errors during active playback
- Now-playing card updates in place to avoid channel spam on track changes
- Video/audio downloads with format selection and progress tracking
- Moderation: warn, mute, kick, ban with case tracking
- Auto-mod: word filter, link filter, spam detection
- Custom commands, embed builder, auto-messages (welcome/leave)
- Reaction roles, role management
- Centralized guild automation (`/guildconfig`) with manifest capture, drift plans,
  reconcile/apply flows, and cutover checklist tracking
- Guild automation API apply/reconcile now execute real mutation runs
  (`capture -> plan -> apply`) with persisted run outcomes (`completed`,
  `blocked`, `failed`)
- Guild automation reconciliation uses ID-first mapping with deterministic
  fallback (role/channel keys) and persists remapped manifest IDs to prevent
  repeated create/delete drift loops
- Twitch stream notifications (EventSub WebSocket)
- Last.fm scrobbling integration

### Dashboard
- Discord OAuth authentication
- Guild management with bot status
- Neo-editorial shell with responsive sidebar and contextual page framing
- Dashboard, Servers, and Last.fm pages aligned to shared status/empty-state primitives
- Module/command toggle per server
- Guild RBAC by Discord role (`view`/`manage`) with hybrid fallback:
  owners/admin/manage-server users keep baseline access when grants are absent,
  while role grants control non-admin module access
- `/servers` remains available to authenticated users even when module-level
  access is restricted, so server discovery/invite flows stay reachable
- Sidebar identity resolution chain: `nick > globalName > username`
- Dashboard guild metrics now use live bot/API counts, rendering unknown values
  as `—` instead of `0`
- Moderation case viewer and settings
- Auto-mod configuration
- Server logs with filtering
- Music player with real-time SSE updates
- Feature toggle management (Unleash + env var fallback)

### Backend Quality
- Zod input validation on all routes
- Rate limiting (API 100/min, auth 20/15min, write 30/min)
- Centralized error handling (AppError + asyncHandler + errorHandler)
- Request logging middleware
- Auth readiness health contract at `GET /api/health/auth-config`
  (includes `clientId` and generated `authorizeUrlPreview`, without secrets)
- Guild automation execution locking is Redis-backed and fail-closed when lock
  infrastructure is unavailable
- 421 tests (361 backend + 60 frontend), 96% statement coverage

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
npm run lint --workspace=packages/frontend
npm run lint --workspace=packages/backend
npm run type:check      # TypeScript validation
npm run test            # Backend tests (Jest)
npm run test:coverage   # With coverage report
npm run format          # Prettier
```

Backend lint now runs in strict mode across all backend routes and middleware.
Use `npm run lint:full --workspace=packages/backend` for explicit backend-only
verification in CI or local checks.

### Remote Deploy (No SSH)

```bash
./scripts/deploy-remote.sh main
# or
npm run deploy:homelab
```

Triggers the GitHub `Deploy to Homelab` workflow, waits for completion, and shows failed logs.
Webhook deployments pin `COMPOSE_PROJECT_NAME=lucky` and resolve the active
compose working directory, so runs from `/repo` target the existing homelab stack.
The webhook container now executes deploy commands from
`/home/luk-server/Lucky` to match the live compose stack metadata.
Interrupted deploys now auto-recover stale lock directories on the next run.
Deploy workflow smoke checks now require `GET /api/health/auth-config` to return
`status=ok` with no warnings (including healthy Redis/auth-session flags).
Deploy workflow now also validates the `/api/auth/discord` redirect contract:
`302` to Discord authorize URL with expected `client_id` and same-origin
`redirect_uri=https://lucky.lucassantana.tech/api/auth/callback`.
Both deploy smoke checks now retry during rollout until the new backend
containers are serving the expected contract.

Vercel note: `vercel.json` runs `npm run db:generate` before `build:shared` and `build:frontend` to ensure Prisma generated client files are present during cloud builds.
For hosted frontend deployments, set `VITE_API_BASE_URL` to your backend API origin
(example: `https://api.yourdomain.com/api`) to avoid auth/API loop misrouting.
Last.fm dashboard connect links use this same API base, so split-origin
deployments should keep `VITE_API_BASE_URL` aligned with the public backend.
Authenticated frontend shell routes now bootstrap guild selection globally, so
the server selector is populated immediately after login without requiring a
visit to `/servers` first.
Guild auto-selection prioritizes the first server where Lucky is already added;
if none are bot-added, the dashboard keeps no selected server and shows a clear
selection/empty guidance state.
Server selector empty/error states are split:
- `No accessible servers found` means authentication worked but no authorized
  guilds matched your access policy.
- `Could not load servers` means auth/session/network/upstream fetch failed;
  use `Retry` or `Re-authenticate` from the selector.
- `Select a Server` in dashboard after login means no bot-added server was
  auto-selected yet; open `/servers` to invite Lucky to additional servers.
Without `VITE_API_BASE_URL`, frontend uses same-origin `/api` for
`*.lucassantana.tech` hosts and `api.luk-homeserver.com.br` for
`*.luk-homeserver.com.br`.
When `WEBAPP_FRONTEND_URL` includes multiple origins, use comma-separated values
(example: `https://lucky.lucassantana.tech,https://lukbot.vercel.app`); backend CORS
accepts all configured entries while OAuth/Last.fm redirects use the first origin.
Set `WEBAPP_REDIRECT_URI` to the exact Discord OAuth callback URL registered in the
Discord Developer Portal (example: `https://lucky.lucassantana.tech/api/auth/callback`).
For this release cycle, keep the frontend-host callback as canonical in Discord.
Set `WEBAPP_EXPECTED_CLIENT_ID` to the production Discord app id to make
`/api/health/auth-config` return `degraded` on credential drift.
Set `WEBAPP_BACKEND_URL` to your public backend/API origin when you expose API routes
through a dedicated host. Use an absolute URL (for example,
`https://lucky-api.lucassantana.tech`).
When `WEBAPP_BACKEND_URL` is temporarily missing, `/api/health/auth-config`
now validates OAuth origin against the current request origin fallback so deploy
smoke checks can confirm live routing contract correctly.
Bot `/lastfm link` URLs prioritize `WEBAPP_BACKEND_URL` and fall back to the
origin of `WEBAPP_REDIRECT_URI` when backend URL is not set.

Discord Developer Portal URL mapping for this deployment:

- General Information:
  - Interaction Endpoint URL: leave empty
  - Linked Roles Verification URL: leave empty
  - Terms of Service URL: `https://lucky.lucassantana.tech/terms-of-service`
  - Privacy Policy URL: `https://lucky.lucassantana.tech/privacy-policy`
- Installation:
  - Installation Link (custom): `https://lucky.lucassantana.tech/install`
  - Install redirect target: `/api/auth/discord`
  - Install contexts: Guild Install enabled, User Install disabled
- Activities -> URL Mappings:
  - Root mapping prefix: `/`
  - Root mapping target: `lucky.lucassantana.tech`
  - Proxy path mappings: none (leave empty)

## Environment Variables

See `.env.example` for all available options. Key variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `DISCORD_TOKEN` | Yes | Discord bot token (bot runtime + backend guild membership checks) |
| `CLIENT_ID` | Yes | Discord application client ID |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `REDIS_HOST` | No | Redis host (default: localhost) |
| `WEBAPP_ENABLED` | No | Enable web dashboard (default: false) |
| `WEBAPP_SESSION_SECRET` | No | Session encryption key |
| `WEBAPP_REDIRECT_URI` | No | Explicit Discord OAuth callback URL (must match Discord app settings); fallback origin source for Last.fm connect links when backend URL is unset |
| `WEBAPP_EXPECTED_CLIENT_ID` | No | Expected Discord app client id for `/api/health/auth-config` mismatch detection |
| `WEBAPP_BACKEND_URL` | No | Public backend/API origin used as canonical host for backend links and bot Last.fm connect links (must be an absolute URL) |
| `CLIENT_SECRET` | No | Discord OAuth secret (for dashboard) |
| `SENTRY_DSN` | No | Error tracking |

Local Vercel export files (`.env.vercel.*`) are treated as machine-local
artifacts and are git-ignored by default.

### Feature Toggles

Two-tier system: Unleash (optional) → env vars (`FEATURE_<NAME>=true|false`) → defaults.

Set `UNLEASH_URL` and `UNLEASH_API_TOKEN` for Unleash, or use `FEATURE_DOWNLOAD_VIDEO=true` style env vars.

## Documentation

- [Architecture](docs/ARCHITECTURE.md) — Package layout, entry points, adding new code
- [Bot Command Roadmap](docs/BOT_COMMAND_ROADMAP_BENCHMARKS.md) — Benchmark-driven,
  6-week command rollout plan inspired by top Discord bots
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

### Server Setup
`/serversetup template:forge-space [mode:apply|dry-run]`
`/serversetup template:criativaria [mode:apply|dry-run]`

Setup behavior:
- `mode` is optional and defaults to `apply`
- `forge-space` creates the base channel/role layout and welcome embed
- `dry-run` mode previews planned setup changes without mutating guild state
- `criativaria` validates fixed channel/role mappings and continues with warnings
  when required IDs are missing
- Preserves existing guild visual identity (icon, splash, and banner)
- Uploads `assets/criativaria-banner.png` to staff assets once and reuses the
  Discord CDN URL in embed templates
- Applies idempotent upserts for moderation, automod, guild settings,
  auto-messages, embed templates, custom commands, role exclusivity, and Twitch
  seed configuration

### Management
`/guildconfig capture` `/guildconfig plan` `/guildconfig apply`
`/guildconfig reconcile` `/guildconfig status` `/guildconfig cutover`

## Centralized Guild Automation

Lucky now supports declarative server automation for guild operations:

- Manifest-backed desired state persisted in database
- Shadow capture and drift planning against live guild state
- Safe auto-apply for non-destructive changes
- Protected operations (deletes/permission tightening) require explicit opt-in
- Native Discord onboarding mapping (`fetchOnboarding`/`editOnboarding`) is first-class
- Cutover role cleanup targets only external bots explicitly flagged with
  `retireOnCutover: true` in parity manifest data
- Automation API precondition failures (`no manifest`, `capture required`,
  `apply already running`) return actionable 4xx responses

## Contributing

1. Fork and create a feature branch
2. Follow conventional commits (`feat:`, `fix:`, `refactor:`, etc.)
3. Run `npm run lint && npm run type:check && npm run test` before PR
4. Keep functions <50 lines, files <250 lines

## License

ISC
