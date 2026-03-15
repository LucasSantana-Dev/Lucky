# Lucky Implementation Status

**Last Updated:** 2026-03-15  
**Current Version:** v2.6.20

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
- Queue management: `/queue show`, `/queue clear`, `/queue remove`, `/queue move`, `/queue shuffle`
- `/queue rescue` — probe-based detection and removal of unresolvable tracks (v2.6.20)
- `/lyrics` — paginated lyrics via lyrics.ovh with smart query cleaning
- `/repeat`, `/autoplay` — repeat mode and autoplay toggle

#### Music Intelligence
- **Autoplay** — recommendation engine with similarity scoring (genre, tag, artist, duration, popularity)
- **Diversity caps** — max 2 tracks per artist, max 3 per source; same-source penalty −0.15 (v2.6.19)
- **Recommendation reason tags** — shows why a track was autoplay-queued (v2.6.20)
- **Feedback** — `/recommendation feedback` (like/dislike) stored per guild+user in Redis, 24h TTL
- **`/music health`** — provider health, watchdog state, queue diagnostics, session snapshot, feedback count

#### Music Reliability
- **ProviderHealthService** — score-based provider ordering, cooldown on repeated failures, configurable via `MUSIC_PROVIDER_COOLDOWN_MS`
- **MusicWatchdogService** — per-guild arm/clear/recover cycle; detects stale connection and retries rejoin + replay
- **Session snapshots** — Redis-backed queue state (`music:snapshot:{guildId}`, 30-min TTL); restored on bot restart via `restoreSessionsOnStartup`

#### Moderation (`/warn`, `/mute`, `/unmute`, `/kick`, `/ban`, `/unban`, `/case`)
- Full case management with case number tracking, DM notifications, evidence logging
- **AutoModService** — spam detection, caps lock threshold, link filtering, word filter, raid detection
- Configurable per-guild via management commands

#### Management
- Embed builder, custom commands, auto-messages (welcome/leave/scheduled), server logs
- Guild automation (RBAC-aware role assignment, member join/leave events)
- `/session` — view and restore music session snapshots

#### Download
- `/download` — yt-dlp powered media download command

#### General
- `/help`, `/ping`, `/invite`, standard utility commands

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

## Known Gaps (Tracked as Issues)

| Issue | Title | Status |
|-------|-------|--------|
| #279 | Music watchdog cross-guild periodic scan | Open |
| #280 | `MUSIC_PROVIDER_FAILURE_THRESHOLD` env var | Open |
| #281 | discord-player-youtubei v2.0.0 | **Closed (merged v2.6.20)** |
| #282 | Autoplay feedback: user-scoped, 30d TTL, like-boost, clearfeedback | Open |
| #268 | /queue smartshuffle | Open |
| #269 | /mod digest | Open |

---

## Deferred / Backlog

- Presence/activity improvement
- `/queue smartshuffle` (#268)
- `/mod digest` (#269)
- Autoplay intelligence v2: feedback diversity, reason tag expansion
- Guild automation RBAC deltas
