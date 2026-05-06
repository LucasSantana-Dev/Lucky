# Lucky Discord Bot — Full RAG Context

> Generated: 2026-05-04 | Version: 2.8.0 | Repo: github.com/LucasSantana-Dev/Lucky

---

## 1. Project Overview

**Lucky** is a production-grade, self-hosted Discord music bot + web dashboard built as a TypeScript monorepo.

- **Live**: https://lucky.lucassantana.tech
- **Bot ID**: `962198089161134131`
- **Stack**: Node.js 22 · TypeScript 5.9 · Discord.js 14 · Discord Player 7 · Prisma 7 · Express 5 · React 19 · Redis · Docker
- **Tests**: ~2500 (Jest for backend/bot, Vitest for frontend)
- **CI**: GitHub Actions · SonarCloud (80% new-code coverage gate) · GitGuardian · Vercel
- **License**: ISC

---

## 2. Monorepo Structure

```
Lucky/
├── packages/
│   ├── shared/     # @lucky/shared — types, services, Prisma client, config
│   ├── bot/        # @lucky/bot    — Discord.js 14 bot (commands, events, player)
│   ├── backend/    # @lucky/backend — Express 5 REST API
│   └── frontend/  # lucky-webapp  — React 19 dashboard (Vite, Tailwind 4, shadcn/ui)
├── prisma/
│   └── schema.prisma              # Root schema, migrations
├── docker-compose.yml
├── .github/workflows/ci.yml
└── package.json                   # Root workspace (npm workspaces)
```

**Docker services**: `postgres`, `redis`, `bot`, `backend`, `frontend`, `nginx`  
**Nginx routing**: `/api/*` → backend:3000 · `/` → frontend:80 (exposed as host:8080)

---

## 3. Shared Package (`packages/shared/src/`)

The shared package is the foundation — no deps on other monorepo packages.

### Key files
```
src/
├── config/
│   ├── featureToggles.ts       # Feature flag definitions (19 flags)
│   └── vercelFlags.ts          # Vercel Flags SDK client
├── services/
│   ├── FeatureToggleService.ts # Toggle resolution (DB → Vercel → env fallback)
│   └── (prisma, redis, etc.)
├── types/
│   └── featureToggle.ts        # FeatureToggleName, FeatureToggleConfig, GlobalFeatureToggleState
└── generated/prisma/           # Prisma client output
```

### Feature Flags (19 toggles)

All defined in `config/featureToggles.ts`:

| Flag | Description |
|------|-------------|
| `DOWNLOAD_VIDEO` | Video download functionality |
| `DOWNLOAD_AUDIO` | Audio download functionality |
| `MUSIC_RECOMMENDATIONS` | Recommendation system |
| `AUTOPLAY` | Autoplay functionality |
| `LYRICS` | Lyrics display |
| `QUEUE_MANAGEMENT` | Advanced queue management |
| `REACTION_ROLES` | Reaction roles with embeds + buttons |
| `ROLE_MANAGEMENT` | Auto mutually-exclusive roles |
| `MODERATION` | Ban/kick/warn/mute commands |
| `AUTOMOD` | Auto-moderation (spam, caps, links) |
| `CUSTOM_COMMANDS` | Custom command creation |
| `AUTO_MESSAGES` | Scheduled auto-messages |
| `SERVER_LOGS` | Audit logging |
| `WEBAPP` | Web dashboard |
| `TWITCH_NOTIFICATIONS` | Twitch stream notifications |
| `LASTFM_INTEGRATION` | Last.fm scrobbling |
| `WELCOME_MESSAGES` | Welcome/leave messages |
| `ARTIST_COMMAND` | `/artist` top-tracks queue |
| `ALBUM_COMMAND` | `/album` queue |

Env var pattern: `FEATURE_<NAME>=true|false` overrides defaults.

### FeatureToggleService resolution order

1. **DB override** (`global_feature_toggles` table) — `writable: true`, `provider: 'database'`
2. **Vercel Flags** (if `VERCEL_FLAGS_SECRET` configured) — `writable: false`, `provider: 'vercel'`
3. **Environment fallback** (`FEATURE_<NAME>` env var or coded default) — `writable: true`, `provider: 'environment'`

`setGlobalFeatureToggle(name, enabled)` → upserts into `GlobalFeatureToggle` table (takes priority in resolution).

---

## 4. Bot Package (`packages/bot/src/`)

### Command categories

**Music** (`functions/music/commands/`):
`/album` · `/artist` · `/autoplay` · `/clear` · `/djrole` · `/effects` · `/history` · `/leave` · `/leavecleanup` · `/lyrics` · `/move` · `/music` · `/nowplaying` · `/pause` · `/play` · `/playlist` · `/playskip` · `/playtop` · `/queue` · `/recommendation` · `/remove` · `/repeat` · `/replay` · `/seek` · `/session` · `/shuffle` · `/skip` · `/skipto` · `/songinfo` · `/spotify` · `/stop` · `/volume` · `/voteskip`

**Moderation** (`functions/moderation/commands/`):
`/ban` · `/case` · `/cases` · `/digest` · `/history` · `/kick` · `/lockdown` · `/mute` · `/purge` · `/slowmode` · `/unban` · `/unmute` · `/warn`

**Auto-mod** (`functions/automod/commands/`):
`/automod` (subcommands: word filter, link filter, spam detection, presets)

**General** (`functions/general/commands/`):
`/birthday` · `/giveaway` · `/help` · `/lastfm` · `/leaderboard` · `/level` · `/ping` · `/reactionrole` · `/roleconfig` · `/social` · `/starboard` · `/twitch` · `/version` · `/voterewards`

**Management** (`functions/management/commands/`):
`/automessage` · `/autorole` · `/customcommand` · `/embed` · `/guildconfig` · `/serversetup` · `/settings`

**Download** (`functions/download/commands/`):
`/download` (audio + video via yt-dlp)

### Music engine key files

- `functions/music/commands/play/` — Multi-file command: `index.ts`, `processor.ts`, `queryDetector.ts`, `queryUtils.ts`, `queueManager.ts`, `responseHandler.ts`, `spotifyHandler.ts`, `youtubeHandler.ts`
- `functions/music/commands/queue/` — Queue display: `queueDisplay.ts`, `queueEmbed.ts`, `queueFormatter.ts`, `queueGrouping.ts`, `queueStats.ts`
- `functions/music/handlers/play/handlePlay.ts` — Play event handler

**Key service files** (under `src/services/` or `src/functions/music/`):
- `playerFactory.ts` — Discord Player bridge, instance management
- `autoplayService.ts` — Recommendation/autoplay logic
- Services for autoplay use tag-based scoring with Last.fm artist tags; locale-aware (`SPANISH_GENRE_MARKERS` list)

### Artist/Album commands (v2.8.0, PR #799/#800)

`/artist <name>` — queues top tracks from a Last.fm artist (gated by `ARTIST_COMMAND` toggle)  
`/album <artist> <album>` — queues all album tracks (gated by `ALBUM_COMMAND` toggle)

---

## 5. Backend Package (`packages/backend/src/`)

### Route registry (`routes/index.ts`)

```typescript
// Pre-API routes (no auth required)
setupHealthRoutes(app)        // GET /health
setupStatsRoutes(app)         // GET /stats/public
setupInternalNotifyRoutes(app)
setupWebhookPublicRoutes(app)

// Global rate limit for all /api/ routes
app.use('/api/', apiLimiter)   // 100 req/min

// Admin guards
app.use('/api/admin', requireAuth, requireAdmin)
app.use('/api/toggles/global', requireAuth, requireAdmin, writeLimiter) // 30/min

// Webhook API (after rate limit but no auth)
setupWebhookApiRoutes(app)
setupAdminRoutes(app)

// Per-guild module access guards (requireAuth + requireGuildModuleAccess)
// Guild routes guarded by module: moderation, automation, music, integrations, settings
// e.g. /api/guilds/:guildId/moderation → 'moderation' module
//      /api/guilds/:guildId/rbac → 'settings' mode:'manage'

// All route setups
setupAuthRoutes, setupToggleRoutes, setupGuildRoutes,
setupManagementRoutes, setupModerationRoutes, setupLastFmRoutes,
setupSpotifyRoutes, setupGuildSettingsRoutes, setupTrackHistoryRoutes,
setupTwitchRoutes, setupLyricsRoutes, setupRolesRoutes,
setupRbacRoutes, setupGuildAutomationRoutes, setupLevelsRoutes,
setupStarboardRoutes, setupMusicRoutes, setupArtistsRoutes

app.use(errorHandler)
```

### All route files

`admin.ts` · `artists.ts` · `auth.ts` · `authCallback.ts` · `guildAutomation.ts` · `guilds.ts` · `guildSettings.ts` · `health.ts` · `index.ts` · `internalNotify.ts` · `lastfm.ts` · `levels.ts` · `lyrics.ts` · `management.ts` · `managementAutoMessages.ts` · `managementEmbeds.ts` · `moderation.ts` · `music/` · `rbac.ts` · `roles.ts` · `spotify.ts` · `starboard.ts` · `stats.ts` · `toggles.ts` · `trackHistory.ts` · `twitch.ts` · `webhooks.ts`

### All middleware files

`asyncHandler.ts` · `auth.ts` · `errorHandler.ts` · `guildAccess.ts` · `index.ts` · `rateLimit.ts` · `requestLogger.ts` · `requireAdmin.ts` · `session.ts` · `validate.ts`

### Key route implementations

**Admin routes** (`routes/admin.ts`):
```typescript
GET /api/admin/guilds   → requireAuth + requireAdmin → guildService.getAllBotGuilds()
// Returns: { guilds: AdminGuildSummary[] }
// AdminGuildSummary: { id, name, iconUrl, memberCount, textChannelCount, voiceChannelCount, roleCount }
```

**Toggle routes** (`routes/toggles.ts`):
```
GET  /api/toggles/global          → all toggles with provider + writable status
GET  /api/toggles/global/:name    → single toggle state
POST /api/toggles/global/:name    → { enabled: boolean } → upserts DB override (requireAdmin + writeLimiter)
GET  /api/features                → requireAuth → list of { name, description } for all flags
```

### Key middleware

**`requireAdmin`** (`middleware/requireAdmin.ts`):
```typescript
// Reads DEVELOPER_USER_IDS env var via isDeveloperUser(req.userId)
// 401 if no userId, 403 if not developer
```

**`requireAuth`** (`middleware/auth.ts`):
Uses session-based Discord OAuth; sets `req.userId` from session.

**`requireGuildModuleAccess(module, mode?)`** (`middleware/guildAccess.ts`):
Checks RBAC grants in `guild_role_grants` table; default mode `'view'`.

**Rate limits** (`middleware/rateLimit.ts`):
- `apiLimiter`: 100 req/min on all `/api/`
- `writeLimiter`: 30 req/min on `/api/toggles/global`

---

## 6. Frontend Package (`packages/frontend/src/`)

### Pages

`Admin.tsx` · `AutoMessages.tsx` · `AutoMod.tsx` · `Config.tsx` · `CustomCommands.tsx` · `Dashboard.tsx` · `DashboardOverview.tsx` · `EmbedBuilder.tsx` · `Features.tsx` · `GuildAutomation.tsx` · `Landing.tsx` · `LastFm.tsx` · `Levels.tsx` · `Login.tsx` · `Lyrics.tsx` · `Moderation.tsx` · `Music.tsx` · `PreferredArtists.tsx` · `PrivacyPolicy.tsx` · `ReactionRoles.tsx` · `ServerLogs.tsx` · `ServerSettings.tsx` · `ServersPage.tsx` · `Spotify.tsx` · `Starboard.tsx` · `TermsOfService.tsx` · `TrackHistory.tsx` · `TwitchNotifications.tsx`

Each page has a matching `.test.tsx` except `Admin.tsx`, `PrivacyPolicy.tsx`, `Spotify.tsx`, `TermsOfService.tsx`.

### Stores (Zustand)

`authStore.ts` · `featuresStore.ts` · `guildStore.ts`

**`featuresStore`** state:
```typescript
{
  features: Feature[]                    // catalog from /api/features
  globalToggles: Record<string, boolean>
  globalToggleProvider: 'vercel' | 'environment' | 'database'
  globalTogglesWritable: boolean
  isLoading: boolean
  loadError: { kind: 'auth'|'forbidden'|'network'|'upstream', message, scope: 'catalog'|'global', status? } | null
  // Actions: fetchFeatures, fetchGlobalToggles, updateGlobalToggle, clearLoadError
}
```

### Key hooks

**`useFeatures`** (`hooks/useFeatures.ts`):
- Auto-fetches features catalog on mount (if authenticated, not loading)
- Auto-fetches global toggles on mount (only for `isDeveloper` users)
- Returns: `{ globalToggles, globalToggleProvider, globalTogglesWritable, isLoading, features, loadError, isDeveloper, retryLoad, handleGlobalToggle }`

### API client (`services/api.ts`)

Base URL: `inferApiBase(VITE_API_BASE_URL, window.location)` → normalized (trailing slashes removed)

Auth: session cookies (`withCredentials: true`), timeout 10s

**Interceptor**: 401 → `window.location.assign('/api/auth/discord')` + rejects with `ApiError`

**API namespaces**:
```
api.stats         getPublic()
api.auth          checkStatus(), getUser(), logout(), getDiscordLoginUrl()
api.guilds        list(), get(id), getInvite(id), getMe(id), getChannels(id),
                  getRbac(id), updateRbac(id, grants), getSettings(id),
                  updateSettings(id, settings), applyCriativariaPreset(id),
                  getListing(id), updateListing(id, listing)
api.modules       list(guildId), get(guildId, slug), toggle(guildId, id, enabled),
                  getSettings(guildId, slug), updateSettings(guildId, slug, settings)
api.commands      list(guildId), toggle(guildId, id, enabled),
                  getSettings(guildId, id), updateSettings(guildId, id, settings)
api.features      list(), getGlobalToggles(), updateGlobalToggle(name, enabled)
api.admin         getGuilds()
api.trackHistory  getHistory(guildId, limit=50, offset=0), getStats(guildId),
                  getTopTracks(guildId, limit=10), getTopArtists(guildId, limit=10),
                  clearHistory(guildId)
api.twitch        status(), lookupUser(login), list(guildId), add(guildId, data), remove(guildId, twitchUserId)
api.lastfm        status(), unlink(), getConnectUrl()
api.spotify       status(), unlink(), getConnectUrl()
api.lyrics        search(title, artist?)
api.autoMessages  createAutoMessagesApi(apiClient)
api.embeds        createEmbedsApi(apiClient)
api.reactionRoles createReactionRolesApi(apiClient)
api.automation    createAutomationApi(apiClient)
api.levels        createLevelsApi(apiClient)
api.starboard     createStarboardApi(apiClient)
api.music         createMusicApi(apiClient)
api.moderation    createModerationApi(apiClient)
api.automod       createAutoModApi(apiClient)
api.serverLogs    createLogsApi(apiClient)
api.artists       createArtistsApi(apiClient)
```

---

## 7. Database Schema (Prisma)

**Location**: `prisma/schema.prisma` (root)  
**Client output**: `packages/shared/src/generated/prisma`  
**Provider**: PostgreSQL with `@prisma/adapter-pg`

### Models summary

| Model | Table | Key fields |
|-------|-------|-----------|
| `User` | `users` | discordId (unique), username, avatar |
| `UserPreferences` | `user_preferences` | preferredVolume, autoPlayEnabled, repeatMode, shuffleEnabled |
| `Guild` | `guilds` | discordId (unique), name, icon, ownerId |
| `GuildSettings` | `guild_settings` | defaultVolume, autoplayMode (similar/discover/popular), language, birthdayChannelId |
| `GuildFeatureToggle` | `guild_feature_toggles` | guildId+name unique, enabled |
| `GlobalFeatureToggle` | `global_feature_toggles` | name (unique), enabled |
| `TwitchNotification` | `twitch_notifications` | guildId+twitchUserId unique |
| `GuildRoleGrant` | `guild_role_grants` | guildId+roleId+module unique (RBAC) |
| `GuildAutomationManifest` | `guild_automation_manifests` | guildId unique, manifest JSON |
| `GuildAutomationRun` | `guild_automation_runs` | guildId, type, status, operations JSON |
| `GuildAutomationDrift` | `guild_automation_drifts` | guildId+module unique, drift JSON |
| `GuildSession` | `guild_sessions` | guildId, session state |
| `CommandUsage` | `command_usage` | userId, guildId, commandName |

**Enum**: `AutoplayMode { similar, discover, popular }`

---

## 8. Admin Panel (v2.8.0, PR #801)

New developer-only admin area gated by `DEVELOPER_USER_IDS` env var.

**Route guard** (in `routes/index.ts`):
```
app.use('/api/admin', requireAuth, requireAdmin)
app.use('/api/toggles/global', requireAuth, requireAdmin, writeLimiter)
```

**Backend endpoint**: `GET /api/admin/guilds` → `{ guilds: AdminGuildSummary[] }` (all guilds the bot is in)

**Frontend**: `pages/Admin.tsx` — shows bot guild list + global feature toggle management  
**Guard**: `isDeveloper` from `authStore` (user's Discord ID in `DEVELOPER_USER_IDS`)

**`requireAdmin` middleware** reads `DEVELOPER_USER_IDS=282294772570521600` (comma-separated).

---

## 9. CI / Testing

### Test setup

| Package | Runner | Config |
|---------|--------|--------|
| `@lucky/bot` | Jest | `jest.config.ts` |
| `@lucky/backend` | Jest | Unit + integration in `tests/unit/` + `tests/integration/` |
| `lucky-webapp` | Vitest | `vitest.config.ts` |

### Test patterns

- **Backend unit tests**: Jest with `jest.fn()`, `jest.mock()` for module isolation  
  - Route index tests mock ALL route setup functions AND middleware  
  - `MockApp = Pick<Express, 'use'>` for route registry tests (note: `setupAdminRoutes` uses `app.get()` directly, so it MUST be mocked)
- **Frontend unit tests**: Vitest with `vi.fn()`, `vi.mock()`, `vi.hoisted()` for top-level mock hoisting  
- **Integration tests**: Tests in `packages/backend/tests/integration/` hit real Express app with mocked services

### Coverage gate

SonarCloud requires **80% new-code coverage** to merge. Backend has bot coverage at ~74% lines.

### CI commands

```bash
npm run verify          # lint + build + test + audit (pre-PR gate)
npm run test:all        # all tests
npm run test:e2e        # Playwright smoke tests
```

---

## 10. Current State (2026-05-04)

### Version
All packages at `2.8.0`. Tags point at `chore: bump version to X` commits, NOT main HEAD.

### Open PRs
- **#801** `feat(admin): add admin panel with writable global feature toggles` — `feature/admin-panel-global-toggles` — CI pending (empty commit pushed to re-trigger)

### Recent merges (last 5 on main)
```
90727ded  chore: bump version to 2.8.0 (#799)
f7eccd27  feat(music): add /artist and /album commands, fix queue priority
72ee59ed  chore: bump version to 2.7.0 (#797)
58e70f8b  feat(shared): migrate feature toggles from Unleash to Vercel Flags (#796)
e13998ff  chore(deps): bump production-dependencies group (9 updates) (#795)
```

### Pending (from backlog-2026-05-03-admin-panel.md)
- **A3**: Run DB migration for `GlobalFeatureToggle` table on homelab (`npx prisma migrate deploy`)
- **A4**: Restart backend container to load `DEVELOPER_USER_IDS` env var
- **B1**: Integration tests for admin routes (GET /api/admin/guilds — 401/403/200)
- **B2**: Unit tests for `requireAdmin` middleware

### Known open Dependabot alert
- `file-type` medium severity (GHSA-5v7r-6r5c-r473) — needs discord-player upstream bump to v21+

### Deployment (homelab)
- **Host**: `homelab` via SSH (cloudflared → caddy → docker)
- **Compose file**: root `docker-compose.yml`
- **Backend restart**: `docker compose restart lucky-backend`
- **DB migrate**: `docker exec -it lucky-backend sh -c "npx prisma migrate deploy"`
- **Logs**: `docker compose logs -f bot`

---

## 11. Key Conventions

- **Branch naming**: `feature/`, `fix/`, `chore/` (conventional commits, NO `codex/`)
- **No inline comments** unless WHY is non-obvious
- **Functions under 50 lines**
- **Path aliases**: `@/*` → `./src/*` in bot/backend
- **Mock pattern**: in Jest, always mock route modules that use `app.get()` directly; `MockApp = Pick<Express, 'use'>` won't have `.get`
- **Feature flags**: check `featureToggleService.isEnabled(FLAG_NAME)` before executing gated commands in bot; guard DB writes with the toggle
- **RBAC modules**: `moderation`, `automation`, `music`, `integrations`, `settings` (modes: `'view'`, `'manage'`)
- **API_ROUTES**: use `@lucky/shared/constants` for all route path constants in frontend `api.ts`

---

## 12. File Quick-Reference

| Purpose | Path |
|---------|------|
| Feature flag definitions | `packages/shared/src/config/featureToggles.ts` |
| Feature toggle service | `packages/shared/src/services/FeatureToggleService.ts` |
| Route registry | `packages/backend/src/routes/index.ts` |
| Admin routes | `packages/backend/src/routes/admin.ts` |
| Toggle routes | `packages/backend/src/routes/toggles.ts` |
| requireAdmin middleware | `packages/backend/src/middleware/requireAdmin.ts` |
| Frontend API client | `packages/frontend/src/services/api.ts` |
| Features store | `packages/frontend/src/stores/featuresStore.ts` |
| useFeatures hook | `packages/frontend/src/hooks/useFeatures.ts` |
| Admin page | `packages/frontend/src/pages/Admin.tsx` |
| Prisma schema | `prisma/schema.prisma` |
| Docker compose | `docker-compose.yml` |
| Autoplay service | `packages/bot/src/services/autoplay/autoplayService.ts` |
| Play command | `packages/bot/src/functions/music/commands/play/` |
| Player factory | `packages/bot/src/functions/music/playerFactory.ts` |
