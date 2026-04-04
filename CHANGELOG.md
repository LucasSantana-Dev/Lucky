# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

## [2.6.59] - 2026-04-01

### Fixed

- **Twitch user lookup**: replaced silent failure on credential misconfiguration with `503 Service Unavailable`. When `TWITCH_CLIENT_ID` is absent or an app access token cannot be obtained, the API now returns `503` with a descriptive message. User-not-found still returns `404`.
- **Twitch token refresh**: on a `401` from the Helix API the route now clears the cached app token, fetches a fresh one via client_credentials grant, and retries once — preventing stale-token failures.

## [2.6.58] - 2026-04-01

### Fixed

- **Sentry error logging**: `errorLog({ message })` without an `error` object now calls `captureMessage` so all error-level logs reach Sentry. Previously only calls with an attached `Error` object were captured.
- **Sentry exception context**: `params.message` and `params.data` are now passed as `extras` on every `captureException` call so Sentry events include the log message alongside the stack trace.
- **Error serialization in console**: Replaced `JSON.stringify(error)` (which returns `{}` for native `Error` objects) with a `serializeError` helper that extracts `name`, `message`, and `stack`.

## [2.6.57] - 2026-04-01

### Fixed

- **play command interaction timeout**: Moved `deferReply()` to the top of the play command's `execute` before any validation checks, and converted early-exit `reply()` calls to `editReply()`. Prevents `DiscordAPIError[10062]` when pre-checks run after the 3-second window (LUCKY-1Y).
- **Interaction already acknowledged race condition**: Wrapped `deferReply()` in `handleChatInputCommand` and `handleOtherInteraction` (`interactionReply.ts`) in a try-catch so concurrent or duplicate acknowledgement attempts (40060) are silently discarded instead of throwing (LUCKY-23).

## [2.6.56] - 2026-03-31

### Fixed

- **play-dl SoundCloud auth**: `streamViaSoundCloud` threw on every track because `getFreeClientID()` + `setToken()` was never called at startup. Added `initPlayDlSoundCloud()` running before `YoutubeiExtractor` registration so the SoundCloud bridge actually streams (LUCKY-26).
- **`/version` command timeout**: Replaced `interaction.reply()` with `deferReply()` + `editReply()` so file I/O reading `package.json` no longer races Discord's 3-second interaction window (LUCKY-25).
- **Missing `live_boards` migration**: Added `npx prisma migrate deploy` to bot container `CMD` so the `channelId` column is created in production before the bot initialises (LUCKY-22).

## [2.6.55] - 2026-03-31

### Changed

- **AI Dev Toolkit board**: Replaced GitHub releases embed with a living Portuguese-language educational article. Polls the repo tree on every sync cycle so the patterns list stays up-to-date without a new release. Stores all message IDs so partial fetches are cleaned up cleanly before a repost.

### Fixed

- **AiDevToolkitService race condition**: Parallel `Promise.all([commit, tree])` could cache a stale tree if the two GitHub API calls resolved on different revisions. Fetch is now sequential: commit first → extract `commit.commit.tree.sha` → fetch tree with that SHA. Both fetches are bounded by `AbortSignal.timeout(10_000)`.
- **Orphaned messages on partial fetch**: Replaced the reset-on-error pattern with a `foundAllMessages` flag so messages fetched before a failure are deleted before reposting.
- **`@mention` injection**: Added `allowedMentions: { parse: [] }` to `channel.send()` and `message.edit()` to prevent pattern slugs derived from repo content from triggering Discord @mentions.

### Added

- `AI_DEV_TOOLKIT_CHANNEL_ID` and `AI_DEV_TOOLKIT_CHECK_INTERVAL` env vars documented in `docker-compose.yml`.
