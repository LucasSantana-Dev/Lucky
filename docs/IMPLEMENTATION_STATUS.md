# Lucky Implementation Status

**Last Updated:** 2026-04-07  
**Current Version:** v2.6.63

This document reflects what is currently shipped and running in production.

---

## Shipped Features

### Core Infrastructure

- **Monorepo**: `packages/shared`, `packages/bot`, `packages/backend`, `packages/frontend`
- **Database**: PostgreSQL via Prisma (23 tables — guilds, users, moderation, music, management, logging)
- **Cache**: Redis for session snapshots, recommendation feedback, track history, queue state
- **CI/CD**: GitHub Actions → Docker build/push → homelab deploy via webhook; all green
- **Auth**: Discord OAuth2 (backend session + frontend cookie); smoke-tested on every deploy

### Bot Commands

#### Music (`/play`, `/queue`, `/skip`, `/stop`, `/pause`, `/resume`, `/volume`, etc.)

- Full playback lifecycle with Discord Player v7
- Queue management: `/queue show`, `/queue clear`, `/queue remove`, `/queue move`
- `/queue shuffle` — standard Fisher-Yates shuffle
- `/queue smartshuffle` — energy-aware shuffle ordered by source/duration energy score, interleaved high/low buckets, per-requester streak limit (v2.6.24)
- `/queue rescue` — probe-based detection and removal of unresolvable tracks (v2.6.20)
- `/lyrics` — paginated lyrics via lyrics.ovh with smart query cleaning (v2.6.60)
- `/repeat`, `/autoplay` — repeat mode and autoplay toggle; autoplay preference persists across sessions (v2.6.61)
- `/session save|restore|list|delete <name>` — named queue snapshots, up to 10 per guild, 30-day TTL, autocomplete on restore/delete (v2.6.63)

#### Music Intelligence

- **Autoplay** — recommendation engine with similarity scoring (genre, tag, artist, duration, popularity)
- **Diversity caps** — max 2 tracks per artist, max 3 per source; same-source penalty −0.15 (v2.6.19)
- **Recommendation reason tags** — shows why a track was autoplay-queued (v2.6.20)
- **Autoplay like-boost** — liked tracks receive +0.3 score bonus and appear more often (v2.6.23)
- **Feedback diversity cap** — liked-feedback tracks are limited to 50% of each autoplay replenish batch with fallback fill when only liked candidates exist (v2.6.39)
- **Expanded reason tags** — autoplay metadata now includes `new in session` and `similar track length` context when applicable (v2.6.39)
- **Feedback** — `/recommendation feedback` (like/dislike) stored per-user in Redis, 30-day TTL; `/music clearfeedback` to reset (v2.6.21)
- **`/music health`** — provider health, watchdog state, queue diagnostics, session snapshot, feedback count

#### Music Reliability

- **ProviderHealthService** — score-based provider ordering, cooldown on repeated failures, Redis-persisted state across restarts; configurable via `MUSIC_PROVIDER_COOLDOWN_MS`, `MUSIC_PROVIDER_FAILURE_THRESHOLD` (v2.6.21)
- **MusicWatchdogService** — per-guild arm/clear/recover cycle; detects stale connection and retries rejoin + replay; periodic cross-guild orphan scan (default 60s) via `MUSIC_WATCHDOG_SCAN_INTERVAL_MS` (v2.6.21, v2.6.22)
- **Session snapshots** — Redis-backed queue state (`music:snapshot:{guildId}`, 30-min TTL); restored on bot restart via `restoreSessionsOnStartup`

#### Moderation (`/warn`, `/mute`, `/unmute`, `/kick`, `/ban`, `/unban`, `/case`, `/cases`, `/history`)

- Full case management with case number tracking, DM notifications, evidence logging
- **`/digest`** — moderation activity digest with period-filtered stats and top 5 moderators (7d/30d/90d) (v2.6.24)

#### Auto-Moderation (`/automod`)

- **AutoModService** — spam detection, caps lock threshold, link filtering, invite filtering, word filter
- Configurable per-guild: `/automod spam`, `/automod caps`, `/automod links`, `/automod invites`, `/automod words`
- **`/automod status`** — view current settings
- **`/automod preset`** — apply pre-built rule packs: `balanced`, `strict`, `light`; merges with existing exempt channels/roles (v2.6.25)

#### Management

- Embed builder (`/embed`), custom commands (`/customcommand`), auto-messages (`/automessage`)
- Server logs (`/serverlog`), guild automation (RBAC-aware role assignment)
- Reaction roles (`/reactionrole`)

#### Download

- `/download` — yt-dlp powered media download command

#### General

- `/help`, `/ping`, `/lastfm`, `/twitch`, `/roleconfig` — standard utility commands
- `/starboard` — setup/disable/status/top plus reaction-based pinning to a starboard channel (v2.6.26)
- `/level` — rank, leaderboard, setup, and role rewards powered by XP tracking (v2.6.26)

### Engagement Layer

- **StarboardService** — per-guild starboard config + tracked entries with star counts and source message mapping
- **LevelService** — XP accrual, level progression (`level^2 * 100`), rank/leaderboard queries, and level-based role rewards
- **Event wiring** — reaction handler updates starboard entries; message handler awards XP with cooldown, level-up announcement, and role reward assignment
- **Presence rotation** — configurable activity templates with runtime guild/member/command/music tokens, fallback text, and interval control

### Playback Stability

- **Play reliability** — yt-dlp extraction now uses resilient format fallback `-f bestaudio/best` (v2.6.38)
- **Autoplay reliability** — search fallback retries with `YOUTUBE_SEARCH` when `AUTO` parser/search fails (v2.6.38)
- **Docker build stability** — root image builds skip yt-dlp binary download via `YOUTUBE_DL_SKIP_DOWNLOAD=1` (v2.6.38)
- **Play command hardening** — validation before deferReply, ephemeral error replies, Sentry noise reduction for expired interactions (v2.6.60–v2.6.62)
- **Voice connection hardening** — configurable connection timeout, watchdog recovery rejoin wait cycle (v2.6.61)
- **Last.fm session resilience** — auto-unlink invalid sessions, P2025 cleanup tolerance, no env fallback retry loop (v2.6.61)
- **Autoplay source diversity** — stronger same-source penalty in scoring to favor varied sources (v2.6.62+)

### Backend API (`packages/backend`)

- Express REST API for the web dashboard
- Routes: guilds, users, settings, moderation cases, server logs, auth (Discord OAuth2)
- Session-based auth with Redis store
- Health endpoints: `/api/health`, `/api/health/auth-config`, `/api/health/version` (commit SHA verification, v2.6.60), `/api/health/cache` (Redis metrics)

### Frontend (`packages/frontend`)

- React 19 + Vite 8 + Tailwind 4 + shadcn/ui dashboard
- Pages: Login, Servers, Dashboard Overview, Features, Config, Server Settings, Moderation, AutoMod, Server Logs, Music, Track History, Lyrics, Custom Commands, Auto Messages, Embed Builder, Reaction Roles, Guild Automation, Levels, Starboard, Twitch Notifications, Last.fm, Terms of Service, Privacy Policy
- Discord OAuth2 login flow with RBAC module guards
- Shell/sidebar redesign: persistent guild block, 6-group nav, strong active-item treatment (v2.6.62+)
- Dashboard Overview: moderation stats, recent cases, quick actions, cases-by-type breakdown

### CI/CD & Deploy (v2.6.60+)

- **Deploy pipeline**: docker-publish → version validation (polls `/api/health/version` for commit SHA match) → OAuth smoke checks → homelab webhook
- **Docker build**: multi-stage (base-runtime → build → production stages), `COMMIT_SHA` build arg injected
- **SonarCloud**: quality gates with CPD exclusion for test files
- **Bundle size tracking**: `compressed-size` workflow
- **Sentry**: active in production with `tracesSampleRate=1.0`, release tagged with `COMMIT_SHA`

---

## Known Gaps / Future Work

| Area                | Description                                           | Complexity |
| ------------------- | ----------------------------------------------------- | ---------- |
| Named sessions      | Multiple named save/restore sessions per guild        | M          |
| Collaborative playlists | Shared curation with contribution limits          | L          |
| Scheduled mod digest | Automated weekly moderation summary to channel       | S          |
| Overview enhancement | Add music + community stats to dashboard overview    | M          |

---

## Env Vars Reference

| Var                                 | Default  | Purpose                                                                               |
| ----------------------------------- | -------- | ------------------------------------------------------------------------------------- |
| `SMART_SHUFFLE_STREAK_LIMIT`        | `2`      | Max consecutive tracks from one requester in smartshuffle                             |
| `AUTOPLAY_FEEDBACK_TTL_DAYS`        | `30`     | Feedback Redis entry TTL in days                                                      |
| `MUSIC_PROVIDER_FAILURE_THRESHOLD`  | `2`      | Failures before provider enters cooldown                                              |
| `MUSIC_PROVIDER_COOLDOWN_MS`        | `240000` | Provider cooldown duration in ms                                                      |
| `MUSIC_WATCHDOG_SCAN_INTERVAL_MS`   | `60000`  | Periodic orphan session scan interval                                                 |
| `QUEUE_RESCUE_PROBE_TIMEOUT_MS`     | `5000`   | Probe timeout for /queue rescue                                                       |
| `BOT_PRESENCE_ACTIVITIES`           | `—`      | Optional presence activity rotation templates with `TYPE:template??fallback` syntax   |
| `BOT_PRESENCE_ROTATION_INTERVAL_MS` | `45000`  | Milliseconds between non-music presence rotation updates (clamped to `15000` minimum) |
| `BOT_PRESENCE_STATUS`               | `online` | Bot presence status for rotation and now-playing updates                              |
