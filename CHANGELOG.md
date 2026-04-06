# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- **command availability hardening**: command bootstrap no longer depends on eager Prisma initialization from `moderationSettings`, so slash commands such as `/version` and `/autoplay` stay available even when unrelated shared service modules would otherwise fail during import.
- **version command accuracy**: `/version` now prefers the runtime package version (`npm_package_version`) and falls back to the root `package.json`, avoiding stale `packages/bot/package.json` version output after releases.

### Changed

- **frontend shell/sidebar foundation**: strengthened the Lucky sidebar into a clearer guild command center with a more prominent active guild block, explicit readiness state, stronger nav grouping, and fuller active-route treatment while keeping route structure unchanged.
- **autoplay diversity tuning**: autoplay recommendation scoring now penalizes same-source tracks more strongly, helping the queue favor varied sources without changing the existing hard caps that prevent refill starvation.
- **presence rotation interval**: added `BOT_PRESENCE_ROTATION_INTERVAL_MS` so non-music Discord presence updates can be slowed down or sped up without changing code, while clamping unsafe low values.
- **presence activity templates**: restored `BOT_PRESENCE_ACTIVITIES` support for tokenized rotation entries, fallback text, and Discord-safe rendering limits while preserving the existing interval behavior.

## [2.6.62] - 2026-04-04

### Fixed

- **play command Sentry noise reduction**: `/play` now treats `DiscordAPIError[10062]` (`Unknown interaction`) as an interaction-expired path before logging command failures, and safely exits when `deferReply` already expired. This prevents recurring false-positive production error reports for already-handled interaction expiry events.

### Changed

- **Criativaria `/serversetup` maintainability**: extracted the Criativaria setup execution into dedicated helper modules and focused tests so the command behavior remains stable while the management setup flow becomes easier to maintain and extend.

## [2.6.61] - 2026-04-03

### Fixed

- **external Last.fm scrobbler**: Invalid Last.fm sessions (`error: 9`, "Invalid session key") are now auto-unlinked per user when detected during `updateNowPlaying`/`scrobble`, preventing repeated log/error spam from stale credentials.
- **Last.fm unlink resilience**: unlink operations now treat Prisma `P2025` (already absent link) as a successful cleanup path, preventing repeated error spam when invalid-session cleanup races or records are already removed.
- **external Last.fm scrobbler fallback control**: per-user scrobbling now disables environment session-key fallback (`LASTFM_SESSION_KEY`) when resolving member keys, preventing repeated cleanup loops for users without valid linked sessions.
- **voice connection hardening (`/play`)**: `player.play` now receives `nodeOptions.connectionTimeout` from environment config, and watchdog recovery performs one additional rejoin wait cycle before failing.

### Changed

- **music connection defaults**: `PLAYER_CONNECTION_TIMEOUT` default increased from `5000` to `15000` ms, and production compose now injects `PLAYER_CONNECTION_TIMEOUT` plus `MUSIC_WATCHDOG_RECOVERY_WAIT_MS` explicitly for deterministic runtime behavior.

## [2.6.60] - 2026-04-01

### Fixed

- **play command**: Validation (guild context and voice channel) now runs before `deferReply`. Errors reply ephemerally via `interaction.reply` so the user sees the message privately without a public "bot is thinking" indicator.
- **guildconfig command**: Same validation-before-defer fix — guild-only guard now replies ephemerally before deferring.
- **embed converter**: Removed hardcoded Portuguese strings (`"erro"`, `"Erro"`, `"Informação"`) from `interactionReply.ts`; error/info embed detection is now language-agnostic.
- **command loader**: De-duplicate when a flat file (e.g. `play.ts`) and a subdirectory index (e.g. `play/index.ts`) both exist — flat file takes precedence, preventing the same command loading twice.

### Changed

- **version command**: Read bot version from `process.env.npm_package_version` at startup instead of streaming `package.json` at runtime — eliminates the file I/O on every `/version` invocation.

### Added

- **`GET /api/health/version`**: New endpoint returning `{ commitSha, version }` from Docker build args and `npm_package_version`. Enables the deploy pipeline to verify the exact commit SHA went live before marking the deploy successful.

### CI/Infrastructure

- **deploy pipeline**: Wait for `docker-publish` to complete before firing the homelab webhook. Fail closed when no docker-publish run is found for the commit SHA (opt-out via `FORCE_UNVERIFIED_DEPLOY=true`).
- **deploy pipeline**: New *Validate deployed version* step polls `/api/health/version` until the deployed `commitSha` matches `github.sha` before proceeding to OAuth smoke checks — eliminates false-positive green deploys against stale images.
- **docker build**: `COMMIT_SHA` build arg injected in `docker-publish.yml` and set as `ENV` in the backend stage of the Dockerfile.
