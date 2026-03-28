<p align="center">
  <img src="assets/lucky-social-preview.png" alt="Lucky — Verified Discord Bot" width="720" />
</p>

<p align="center">
  <b>Verified Discord Bot</b> — All-in-one platform with web dashboard.<br/>
  Music, moderation, auto-mod, custom commands, feature toggles, and server management.
</p>

[![CI](https://github.com/LucasSantana-Dev/Lucky/actions/workflows/ci.yml/badge.svg)](https://github.com/LucasSantana-Dev/Lucky/actions/workflows/ci.yml)
[![Node.js](https://img.shields.io/badge/Node.js-22.x-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg)](https://www.typescriptlang.org/)
[![Discord.js](https://img.shields.io/badge/Discord.js-14.25-purple.svg)](https://discord.js.org/)
[![License](https://img.shields.io/badge/License-ISC-yellow.svg)](LICENSE)
[![Discord](https://img.shields.io/badge/Discord-Verified_Bot-5865F2?logo=discord&logoColor=white)](https://discord.com/application-directory)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen)](CONTRIBUTING.md)

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

### Discord Discovery Media
- **Current (v2)** — branded cards with neon cat mascot + Discord verified badge:
  - `https://raw.githubusercontent.com/LucasSantana-Dev/Lucky/main/assets/discord-discovery-media/2026-03/v2/01-auth-dashboard.png`
  - `https://raw.githubusercontent.com/LucasSantana-Dev/Lucky/main/assets/discord-discovery-media/2026-03/v2/02-server-management.png`
  - `https://raw.githubusercontent.com/LucasSantana-Dev/Lucky/main/assets/discord-discovery-media/2026-03/v2/03-feature-suite.png`
- **Bot banner**: `assets/lucky-bot-banner.png` (600x240)
- **Social preview**: `assets/lucky-social-preview.png` (1280x640)
- **Verified announcement**: `assets/lucky-verified-announcement.png` (1280x640)
- Legacy v1 images kept at `assets/discord-discovery-media/2026-03/final/`

### Latest Release (`v2.6.37`)
- Fixed PostgreSQL persistence in Docker by setting `PGDATA=/var/lib/postgresql/data`
  for Postgres 18 compatibility.
- Previous release (`v2.6.36`) restored play/autoplay reliability with yt-dlp format
  fallback (`bestaudio/best`) and autoplay search fallback (`AUTO -> YOUTUBE_SEARCH`).

## Features

### Bot
- Multi-platform music (YouTube, Spotify) with queue, shuffle, repeat, lyrics, autoplay
- Dynamic Discord presence rotation with live guild/member/session stats and command CTA
- Autoplay recommendations use anti-repeat filtering with queue buffering so shuffle stays useful during autoplay
- Autoplay command recovers active guild queue from player cache fallback to avoid false queue-missing errors during active playback
- Autoplay toggles now respond immediately while queue replenishment runs in the background, reducing interaction timeout risk
- Autoplay-generated tracks preserve autoplay labeling and recommendation context even when requester identity is carried through track metadata instead of bot `requestedBy`
- Sentry monitoring supports bot-specific service tags, release metadata, and fatal-event flushing before shutdown when `SENTRY_DSN` is configured
- Player error/debug handlers are guarded and emit structured diagnostics for safer runtime recovery
- Queue-miss replies now include restart-aware recovery guidance so users can
  resume playback with `/play` after a bot restart
- Now-playing card updates in place to avoid channel spam on track changes
- Video/audio downloads with format selection and progress tracking
- Moderation: warn, mute, kick, ban with case tracking
- Auto-mod: word filter, link filter, spam detection
- Custom commands, embed builder, auto-messages (welcome/leave)
- Runtime command discovery now relies on shared default filtering so
  `*.spec.*` and `*.test.*` files are never imported as command modules
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
- Sidebar server selector preserves stale guild context during transient API
  failures and keeps Retry/Re-auth controls available in the dropdown
- Dashboard guild metrics now use live bot/API counts, rendering unknown values
  as `—` instead of `0`
- Moderation case viewer and settings
- Auto-mod configuration
- Auto-mod templates API with curated presets (`balanced`, `strict`, `light`)
- Server logs with filtering
- Music player with real-time SSE updates
- Feature toggle management (Unleash + env var fallback)
- Auth status payload now includes `user.isDeveloper`, so frontend bootstrap no
  longer probes developer-only global toggle endpoints for standard users
- Server settings are loaded on-demand in `/settings` with explicit retry and
  re-auth guidance when auth/upstream failures occur
- Features page now surfaces auth/forbidden/network/upstream load failures with
  explicit retry/re-auth actions instead of silent fallback
- Features bootstrap now waits for authenticated auth-state readiness before
  fetching catalog/global/server toggles, preventing stale-session `403` probe
  noise during dashboard hydration
- Dashboard API contract uses canonical
  `/api/guilds/:guildId/automessages`; legacy
  `/api/guilds/:guildId/auto-messages` is intentionally unsupported, and stale
  guild `/listing` calls were removed from the frontend client/store surface
- Twitch notifications now accept Twitch URL or login input and resolve Discord
  channel names in notification rows

### Backend Quality
- Zod input validation on all routes
- Rate limiting (API 100/min, auth 20/15min, write 30/min)
- Centralized error handling (AppError + asyncHandler + errorHandler)
- Request logging middleware
- RBAC storage outages now return explicit `503` API responses when
  `guild_role_grants` is unavailable
- Guild access fallback cache is backed by Redis keys (short TTL) so Discord
  `429/5xx` fallback works across multi-instance backend replicas
- Auth readiness health contract at `GET /api/health/auth-config`
  (includes `clientId` and generated `authorizeUrlPreview`, without secrets)
- Deploy OAuth redirect smoke checks derive expected `client_id` and
  `redirect_uri` from `GET /api/health/auth-config` to avoid hardcoded-domain
  drift failures
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
npm run db:migrate   # Required before start; startup preflight checks guild_role_grants
npm start
```

If `npm run db:migrate` is skipped, backend startup preflight fails on missing
`guild_role_grants`, and RBAC endpoints return explicit `503` errors until the
schema is migrated.

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

npm run verify          # Monorepo verify contract (lint, type-check, build, tests, audit:high)
npm run lint            # ESLint
npm run lint --workspace=packages/frontend
npm run lint --workspace=packages/backend
npm run type:check      # TypeScript validation
npm run test            # Backend tests (Jest)
npm run test:all        # Backend + bot + frontend unit/integration tests
npm run test:e2e        # Playwright smoke/regression lane
npm run test:coverage   # With coverage report
npm run audit:high      # Dependency audit (high/critical gate)
npm run format          # Prettier
npm audit --audit-level=high
```

`npm run verify` is the canonical local pre-PR gate and mirrors the merge-risk
surface used by CI: frontend/backend lint, shared export validation, monorepo
type-check, full build, backend + bot + frontend tests, and `audit:high`.
Playwright stays separate under `npm run test:e2e` as a smoke/regression lane
instead of running on every local verify cycle.

For dependency security maintenance, run:

```bash
npm update undici flatted @swc/cli file-type yauzl --workspaces --include-workspace-root
npm audit --audit-level=high
```

Security remediation policy: each hardening cycle clears high/critical
findings first with minimal dependency blast radius, then closes active
moderate chains in focused follow-up PRs. Current audit baseline on `main`
after the latest cycle is `low=0`, `moderate=0`, `high=0`, `critical=0`.

### OpenCode + Codex

Lucky now ships repo-local OpenCode behavior in `opencode.jsonc`.

- Repo-local:
  - `opencode.jsonc`
  - `.opencode/plugins`
  - `.opencode/skills`
  - `scripts/opencode-*`
- Host-local:
  - `~/.config/opencode/opencode.jsonc`
  - provider auth and MCP credentials
  - OpenCode community plugin cache and host-only scripts

The default Lucky stack is:

- local Lucky plugins:
  - `lucky-policy`
  - `lucky-context`
  - `lucky-doc-reminders`
- community add-ons:
  - `opencode-shell-strategy`
  - `@tarquinen/opencode-dcp@latest`

High-risk actions are blocked in-session:

- direct push to `main`
- `git reset --hard`
- `git checkout --`
- `git clean -fd` / `git clean -fdx`
- sensitive file access (`.env`, `.cursor/.env.mcp`, `~/.ssh/**`, `~/.aws/**`, OpenCode auth stores)
- mutating work from the primary Lucky checkout unless `LUCKY_ALLOW_ROOT_MUTATION=1`

OpenCode project commands mirror `.cursor/COMMANDS.md`:

- `/verify`
- `/e2e`
- `/db`

Project setup and verification:

```bash
./scripts/opencode-sync-project-skills.sh
./scripts/opencode-install-community-plugins.sh
./scripts/opencode-verify.sh
```

Remote `server-do-luk` flow:

```bash
./scripts/opencode-sync-server-do-luk-skills.sh
./scripts/opencode-install-community-plugins.sh --remote server-do-luk
./scripts/opencode-verify.sh --remote server-do-luk
./scripts/opencode-attach-server-do-luk.sh
```

Optional add-ons are documented but intentionally disabled in v1:

- `opencode-vibeguard`
- `opencode-helicone-session`
- `opencode-sentry-monitor`
- `opencode-type-inject`

Heavy orchestration plugins stay out of the default stack because Lucky already
uses worktrees, skills, and PR discipline explicitly.

### Local Database Bootstrap

`db:*` scripts now pin Prisma config explicitly via
`--config prisma/prisma.config.ts`, so local runs no longer depend on implicit
config discovery.
`npm run db:generate` now injects a safe fallback `DATABASE_URL` only for
client generation, so CI build jobs can run `build` without a database secret.
Bot-only verification commands now run deterministic preflight bootstrap:
`npm run type:check --workspace=packages/bot` and `npm run build:bot` both
regenerate Prisma client files and rebuild `@lucky/shared` before bot compile
steps, so clean worktrees do not fail with stale/missing shared declaration
artifacts.

`npm run db:migrate` runs a guarded wrapper:
- default path: `prisma migrate dev --config prisma/prisma.config.ts`
- fallback path (local-only): only when Prisma returns the known legacy
  bootstrap failure (`P3006` with missing `guilds`), it runs
  `prisma db push --accept-data-loss`, marks historical migrations as applied in
  lexicographic order, then re-runs `migrate dev` to verify state (and when the
  same legacy shadow-db signature persists, it finalizes with
  `prisma migrate status`)
- all other migration errors fail normally without fallback

For isolated git worktrees, run `npm install` inside each worktree before
full-project verification (`npm run type:check`, `npm run build`) to keep local
package resolution pinned to that worktree.

Backend lint now runs in strict mode across all backend routes and middleware.
Use `npm run lint:full --workspace=packages/backend` for explicit backend-only
verification in CI or local checks.
Sonar main-gate reliability checks are strict on new code: use deterministic
string sorting (`localeCompare`), keyboard-accessible UI interactions for
clickable controls, and bounded parsing logic for user-facing text handling.
SonarCloud workflow policy is token-aware: non-Dependabot runs fail fast when
`SONAR_TOKEN` is missing, while Dependabot PRs skip the Sonar scan step as a
non-blocking success path when secrets are unavailable.
The Sonar workflow uses `SonarSource/sonarqube-scan-action@v7`.
For CI triage on Lucky, use the project skill:
`.cursor/skills/lucky-ci-gate-recovery/SKILL.md`.
For GitHub MCP transport/auth failures (`Transport closed`), use:
`.cursor/skills/mcp-github-recovery/SKILL.md` before switching to `gh` fallback.
That runbook now replaces the deprecated `@modelcontextprotocol/server-github`
runtime with the official `github-mcp-server` binary and aligns Codex,
OpenCode, and Cursor wrappers around `gh auth token` with env fallback.
Bundle-size PR checks export `YOUTUBE_DL_SKIP_DOWNLOAD=true` to keep
`youtube-dl-exec` postinstall deterministic under GitHub API rate limits.

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
Webhook-side deploy readiness probing now falls back to BusyBox `wget` when
`curl` is unavailable inside the webhook container, preventing false
post-rollout timeouts on healthy services.
If OAuth redirect smoke receives only Discord rate-limit responses (`429`)
across all retries, deploy now emits a warning and proceeds after auth-config
contract success, instead of failing the rollout as a false negative.
Deploy webhook rollout now starts `postgres`/`redis`, runs
`prisma migrate deploy`, and executes a `guild_role_grants` relation preflight
before service rollout to fail fast on schema drift.
When those Prisma migration commands run from the webhook container, they must
pin `prisma/prisma.config.ts` (and `prisma/schema.prisma`) explicitly so the
deploy path keeps `DATABASE_URL` resolution deterministic.
CLOUDFLARED tunnel restarts now mount config from `CLOUDFLARED_CONFIG_DIR`
instead of shell `$HOME`; use a canonical host path like
`/home/luk-server/.cloudflared` to avoid deploy-context mount drift.
For deploy incidents where webhook trigger succeeds but API remains `502`, run
the operator diagnostics:

```bash
./scripts/homelab-diagnostics.sh server-do-luk
```

The diagnostics output is sanitized and includes Lucky container state, backend
log tail, and auth health/OAuth checks.

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
Guild selection now loads only member-context bootstrap data and no longer
triggers eager guild detail/listing fetches during route navigation.
Server selector empty/error states are split:
- `No accessible servers found` means authentication worked but no authorized
  guilds matched your access policy.
- `Could not load servers` means auth/session/network/upstream fetch failed;
  use `Retry` or `Re-authenticate` from the selector.
- `Select a Server` in dashboard after login means no bot-added server was
  auto-selected yet; open `/servers` to invite Lucky to additional servers.
- Guild fetch failures keep the current selected server context instead of
  clearing page state, so module pages avoid abrupt resets on transient errors.
Without `VITE_API_BASE_URL`, frontend uses same-origin `/api` for
`*.lucassantana.tech` hosts and `api.luk-homeserver.com.br` for
`*.luk-homeserver.com.br`.
When `WEBAPP_FRONTEND_URL` includes multiple origins, use comma-separated values
(example: `https://lucky.lucassantana.tech,https://lukbot.vercel.app`); backend CORS
accepts all configured entries while Last.fm redirects use the first origin.
Set `WEBAPP_REDIRECT_URI` to the exact Discord OAuth callback URL registered in the
Discord Developer Portal (example:
`https://lucky.lucassantana.tech/api/auth/callback`).
Set `WEBAPP_EXPECTED_CLIENT_ID` from deployment secrets (for example GitHub
Actions secret `WEBAPP_EXPECTED_CLIENT_ID`) to make
`/api/health/auth-config` return `degraded` on credential drift. When unset,
the client-id mismatch warning is skipped.
For `docker-compose.yml` and `docker-compose.dev.yml`,
`POSTGRES_PASSWORD` is required (no hardcoded fallback).
Set `WEBAPP_BACKEND_URL` to your public backend/API origin when you expose API routes
through a dedicated host. Use an absolute URL (for example,
`https://lucky-api.lucassantana.tech`).
OAuth callback generation now uses `WEBAPP_REDIRECT_URI` as canonical callback
source and only falls back to request-derived callback URLs when it is unset.
Bot `/lastfm link` URLs prioritize `WEBAPP_BACKEND_URL` and fall back to the
origin of `WEBAPP_REDIRECT_URI` when backend URL is not set. Legacy
`nexus.lucassantana.tech` origins and non-HTTP(S) origins are rejected for
link generation to prevent stale or invalid production URLs.

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
| `POSTGRES_PASSWORD` | Yes (Compose) | Required by `docker-compose*.yml` (`postgres` + `DATABASE_URL` interpolation) |
| `REDIS_HOST` | No | Redis host (default: localhost) |
| `WEBAPP_ENABLED` | No | Enable web dashboard (default: false) |
| `WEBAPP_SESSION_SECRET` | No | Session encryption key |
| `WEBAPP_REDIRECT_URI` | No | Explicit Discord OAuth callback URL (must match Discord app settings and deploy smoke contract) |
| `WEBAPP_EXPECTED_CLIENT_ID` | No | Expected Discord app client id for `/api/health/auth-config` mismatch detection when explicitly set (recommended via deployment secret) |
| `WEBAPP_BACKEND_URL` | No | Public backend/API origin used for backend links and bot Last.fm connect links (must be an absolute HTTP(S) URL; recommended: `https://lucky-api.lucassantana.tech`) |
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
`/play` `/pause` `/resume` `/skip` `/stop` `/queue` `/volume` `/seek` `/lyrics` `/shuffle` `/repeat` `/clear` `/remove` `/move` `/jump` `/history` `/songinfo` `/autoplay` `/music health`

`/music health` provides operator diagnostics for queue state, resolver
source/cache signals, provider cooldown/score status, watchdog recovery state
and detail, snapshot availability, and actionable recovery next steps.

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
3. Run `npm run verify` before PR (`npm run test:e2e` stays separate for browser smoke)
4. Keep functions <50 lines, files <250 lines

## License

ISC
