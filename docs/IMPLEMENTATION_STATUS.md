# Lucky Implementation Status

**Last Updated:** 2026-03-24  
**Current Version:** v2.6.38

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
- `/lyrics` — paginated lyrics via lyrics.ovh with smart query cleaning
- `/repeat`, `/autoplay` — repeat mode and autoplay toggle

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

### Playback Stability (v2.6.38)

- **Play reliability** — yt-dlp extraction now uses resilient format fallback `-f bestaudio/best`
- **Autoplay reliability** — search fallback retries with `YOUTUBE_SEARCH` when `AUTO` parser/search fails
- **Docker build stability** — root image builds skip yt-dlp binary download via
  `YOUTUBE_DL_SKIP_DOWNLOAD=1`, preventing GitHub API rate-limit install failures

### Backend API (`packages/backend`)

- Express REST API for the web dashboard
- Routes: guilds, users, settings, moderation cases, server logs, auth (Discord OAuth2)
- Session-based auth with Redis store
- Health endpoints: `/api/health`, `/api/health/auth-config`

### Frontend (`packages/frontend`)

- React + Vite + Tailwind dashboard
- Pages: Home, Login, Dashboard, Guild settings, Moderation log, Privacy Policy, Terms of Service
- Discord OAuth2 login flow integrated

---

## Known Gaps / Future Work

| Area               | Description                               | Complexity |
| ------------------ | ----------------------------------------- | ---------- |
| Autoplay diversity | Additional tuning of diversity heuristics | S          |
| Presence/activity  | Activity template customization           | S          |

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
| `BOT_PRESENCE_ROTATION_INTERVAL_MS` | `45000`  | Milliseconds between non-music presence rotation updates (clamped to `15000` minimum) |
| `BOT_PRESENCE_STATUS`               | `online` | Bot presence status for rotation and now-playing updates                              |
