# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.6.77] - 2026-04-10

### Fixed

- **Duplicate "Now Playing" message** — `/play` no longer sends two separate "Now Playing" embeds when the track starts immediately. The interaction reply is now registered as the guild's now-playing display; the `playerStart` handler edits it (refreshing buttons) instead of posting a second message.

## [2.6.76] - 2026-04-10

### Fixed

- **`markAsAutoplayTrack`** — no longer throws when discord-player seals `metadata` as non-configurable; detects the descriptor and mutates the returned object directly instead of calling `Object.defineProperty`.
- **Last.fm 403 Sentry noise** — expired session key errors (403 "Invalid session key") downgraded from `errorLog` (Sentry) to `warnLog`. Was firing after every track play when Last.fm needs re-auth.
- **SoundCloud `?in=` playlist context** — `normalizeSoundCloudUrl` strips the `?in=<playlist>` query param before the extractor receives the URL, fixing `NoResultError` on valid SoundCloud track URLs shared from a playlist.

## [2.6.75] - 2026-04-10

### Fixed

- **`/play` search reliability** — default text search now uses `AUTO_SEARCH` (picks best available extractor) instead of requiring Spotify API to succeed first. Fixes "not playing" for songs where Spotify search was failing.
- **Search fallback chain** — restored full fallback (primary → YouTube → AUTO) for all providers including explicit `provider:spotify`. A fallback source is always better than an error. Fallback attempts are now logged at WARN level.
- **Bridge failures visible** — yt-dlp stream failures now appear in production logs (escalated from DEBUG to WARN).

## [2.6.74] - 2026-04-10

### Fixed

- **`/play provider:spotify`** — explicit provider choice is now respected; bot no longer silently falls back to YouTube when the user specified a provider. Fallback only applies when no provider is given.
- **Stream recovery** — `playerError` handler now correctly recovers from `NoResultError: Could not extract stream` by inserting the YouTube alternative at the front of the queue and skipping the failing track, instead of re-playing the same failing track.

## [2.6.73] - 2026-04-10

### Added

- **`/history [page]`** — paginated view of recently played tracks; shows title, artist, duration, relative Discord timestamp, and 🤖 tag for autoplay-queued tracks. Backed by existing `trackHistoryService` (Redis ring buffer, 100 tracks, 7-day TTL).

## [2.6.72] - 2026-04-10

### Added

- **`/djrole set <role>`** — restrict all music commands to users with a designated DJ role; server admins (ManageGuild) always bypass the check
- **`/djrole clear`** — remove the DJ role restriction
- **`/djrole show`** — display the currently configured DJ role
- **`/voteskip`** — democratic skip: cast a vote to skip the current track; skips automatically when the threshold (default 50%) of eligible voice members vote. Threshold is configurable via `GuildSettings.voteSkipThreshold`. Vote state clears on track change.
- **`/settings music idle-timeout <minutes>`** — configure how long (0–60 min, 0 = disabled) the bot waits in an empty voice channel before automatically disconnecting. Integrates with `MusicWatchdogService.markIntentionalStop` to prevent watchdog reconnect.

### Fixed

- **SoundCloud bridge matching (Sentry LUCKY-26/2P)** — Brazilian funk and tracks with compound DJ names (e.g. "DogDog" vs "Dog Dog" on SoundCloud) now match correctly. Changes:
  - Token match changed from 100% (`every`) to 75% threshold, tolerating accent stripping and compound-word splits
  - Duration tolerance relaxed from 15 s to 30 s
  - `normalizeForMatch` regex uses literal space instead of `\s` (avoids Unicode edge cases)
  - New 3rd fallback stage: strips content from first `(` in the cleaned title and retries SoundCloud search (e.g. "Bohemian Rhapsody (Official Music Live Session)" → "Bohemian Rhapsody")

## [2.6.71] - 2026-04-10

### Added

- **`/playtop <query>`** — queue a track at the front (plays next after current)
- **`/playskip <query>`** — queue a track at the front and immediately skip the current track
- **`/skipto <position>`** — skip all tracks before the given queue position
- **`/seek <time>`** — seek to a position in the current track (`mm:ss` or raw seconds)
- **`/replay`** — restart the current track from the beginning
- **`/leavecleanup`** — remove all queued tracks requested by users who have left the voice channel
- **`/nowplaying`** — alias for `/songinfo`; shows current track with rich embed
- **`/effects bassboost <0-5>`** — apply bass boost via FFmpeg filter (levels map to `bassboost_low` → `bassboost_high`)
- **`/effects nightcore`** — apply nightcore (speed + pitch up) FFmpeg filter
- **`/effects reset`** — remove all active audio effects
- **`/volume`** range extended to 1–200 (was 1–100)
- **`/pause`** now toggles (pauses if playing, resumes if paused); `/resume` removed
- **`/play`** optional `provider` parameter: `spotify` (default) | `youtube` | `soundcloud`
- **`/purge <amount> [user] [contains]`** — bulk delete 1–100 messages; optional user and content filters
- **`/lockdown [reason]`** — toggle `SendMessages` permission for `@everyone` in the current channel
- **`/slowmode <seconds>`** — set channel slowmode (0 = off, max 21600s / 6h)
- **`/autorole add <role> [delay_minutes]`** — assign a role to all new members on join, with optional delay up to 1440 minutes
- **`/autorole remove <role>`** — remove a configured autorole
- **`/autorole list`** — display all configured autoroles for the guild
- **`/giveaway start <duration> <prize> [winners]`** — start a giveaway with 🎉 button entry; duration in `1h`/`30m`/`2d` format
- **`/giveaway end <message_id>`** — end a giveaway early and pick winners
- **`/giveaway reroll <message_id>`** — reroll winners for a completed giveaway
- **Autoplay default ON** — guilds with no stored preference now default to autoplay enabled on new queues
- **Cross-session autoplay deduplication** — `replenishQueue` fetches the last 20 played tracks from persistent history and excludes them from autoplay candidates, preventing recently-played songs from cycling back cross-session

## [2.6.70] - 2026-04-10

### Fixed

- **Autoplay metadata write crash (Sentry LUCKY-2K)** (`packages/bot/src/utils/music/queueManipulation.ts`): `markAsAutoplayTrack` was directly assigning to `track.metadata`, which is a getter-only property on discord-player Track objects. This threw `TypeError: Cannot set property metadata of [object Object] which has only a getter` on every autoplay replenishment call (9 Sentry events in 24h, silently breaking autoplay since v2.6.65). Fixed by replacing direct assignment with `Object.defineProperty(..., { writable: true, configurable: true })`.
- **Source priority ordering**: stream bridge (`playerFactory.ts`) now tries direct YouTube streaming first, falling back to SoundCloud search. Search engine order in autoplay replenishment and Last.fm queries changed from `[SPOTIFY_SEARCH, AUTO, YOUTUBE_SEARCH]` to `[SPOTIFY_SEARCH, YOUTUBE_SEARCH, AUTO]`. `/play` fallback chain now goes Spotify → YouTube → AUTO instead of Spotify → AUTO.

## [2.6.69] - 2026-04-10

### Fixed

- **`/autoplay` 5-10s lag** (`packages/bot/src/functions/music/commands/autoplay.ts`): added `deferReply()` before the DB calls — Discord was timing out waiting for the initial acknowledgement, causing the "Lucky is thinking…" spinner to persist for 5-10 seconds or fail entirely.
- **Music buttons "This interaction failed"** (`packages/bot/src/handlers/musicButtonHandler.ts`): `deferUpdate()` is now called as the very first operation before any checks or queue resolution, guaranteeing the 3-second acknowledgement window is always met. Error responses (not in voice, no queue) use `followUp({ ephemeral: true })` since the interaction is already deferred.
- **`/play` slow reply** (`packages/bot/src/functions/music/commands/play/index.ts`): `applyStoredAutoplayPreference` (Prisma) and `blendAutoplayTracks` (Spotify API) were blocking the "Now Playing" embed. Both now run fire-and-forget after `interactionReply` — users see the response immediately, queue population continues in background.
- **Autoplay repeated songs** (`packages/bot/src/utils/music/searchQueryCleaner.ts`, `packages/bot/src/utils/music/queueManipulation.ts`): `normalizeTrackKey` now uses `cleanTitle`/`cleanAuthor` before hashing, stripping version suffixes so "(Live)", "(Acoustic)", "(Cover)", "(Remix)", "(Instrumental)", etc. are treated as the same song for deduplication. Added 17 new version-variant noise patterns to `NOISE_PATTERNS`.

### Changed

- **Autoplay default ON**: guilds without a stored autoplay preference now default to autoplay enabled on new queues — no more manual `/autoplay` needed on first use.

## [2.6.68] - 2026-04-10

### Fixed

- **Button interaction timeout** (`packages/bot/src/handlers/musicButtonHandler.ts`): `deferUpdate()` is now called centrally after the voice-channel and queue guards, extending the acknowledgement window to 15 minutes for all button handlers. Handlers that update the message use `editReply()` instead of `update()`, and the loop-mode ephemeral reply uses `followUp()`. This prevents "This interaction failed" when Discord's 3-second acknowledgement window expires before the handler returns.
- **Leaderboard pagination buttons silently failing** (`packages/bot/src/handlers/interactionHandler.ts`): `leaderboard_page_*` buttons were not matched by the music-button routing predicate and fell through to `reactionRolesService`, which sent no response. Added `leaderboard_page` to the routing check so pagination buttons are handled by `handleMusicButtonInteraction`.
- **Bot reconnecting and resuming after `/stop` and `/leave`**: `connectionDestroyed` and `disconnect` lifecycle events both called `musicWatchdogService.checkAndRecover()`, which rejoined the voice channel and triggered a session restore. Added `MusicWatchdogService.markIntentionalStop(guildId)` — sets a 5-second flag that short-circuits recovery in `checkAndRecover()`. `/stop` and `/leave` call it immediately before `queue.delete()`.

## [2.6.67] - 2026-04-10

### Fixed

- **YouTube extractor registration** (`packages/bot/src/handlers/player/playerFactory.ts`): `discord-player-youtubei@3.0.0-beta.4` renamed the extractor class from `YoutubeiExtractor` to `YoutubeExtractor` and removed `streamOptions.useClient` / `generateWithPoToken` from the registration options. The old import resolved to `undefined`, causing every bot startup to silently skip YouTube extractor registration and log "YouTube extractor unavailable." All YouTube-backed tracks then fell through to the SoundCloud extractor, which cannot stream tracks unavailable on SoundCloud (e.g. anime openings, niche indie tracks), producing `NoResultError: Could not extract stream for this track` (Sentry LUCKY-2J). Fix: resolve the export by name with a v2 fallback (`YoutubeExtractor ?? YoutubeiExtractor`), drop the removed options, and guard explicitly when neither export is present.

## [2.6.66] - 2026-04-09

### Added

- **`buildCommandTrackEmbed` helper** (`packages/bot/src/utils/general/responseEmbeds/buildTrackEmbed.ts`): combines `trackToData + buildTrackEmbed + setAuthor` into a single call. Used by `pause`, `resume`, and `skip` commands to display a rich track embed with a custom status label (e.g. "⏸️ Paused", "▶️ Resumed", "⏭️ Song skipped") as the embed author.
- **Shared embed builder utilities** (`packages/bot/src/utils/general/responseEmbeds/`): `buildTrackEmbed`, `buildUserProfileEmbed`, `buildListPageEmbed`, `buildPlatformAttribEmbed` — reusable embed constructors shared across commands. Embed functions in `embeds.ts` unified to `createSuccessEmbed`, `createErrorEmbed`, `createInfoEmbed`, `createWarningEmbed`.

### Changed

- **`/pause`, `/resume`, `/skip` commands**: show a rich track embed (title, thumbnail, duration, platform badge, requester footer) instead of a plain text success message when a track is active.
- **`/songinfo` command**: migrated to `buildTrackEmbed` + `trackToData`, removing the legacy inline embed builder.
- **`/level leaderboard`**: results are now paginated (5 entries per page) with prev/next buttons, preventing Discord embed field truncation for guilds with many members. Fetches up to 50 entries via `levelService.getLeaderboard(guildId, 50)`.
- **Queue embed** (`/queue` command): rebuilt with `createQueueEmbed` — structured sections for now-playing, upcoming tracks, queue stats, and music controls, all consistent with shared embed patterns.
- **Engagement commands** (`/starboard`, `/lastfm`): migrated to shared embed builders (`buildListPageEmbed`, `buildPlatformAttribEmbed`, `createSuccessEmbed/createErrorEmbed/createInfoEmbed`).
- **Autoplay embed** (`/play` now-playing): added `.setTimestamp()` to embed builder for consistent timestamp display. Error handler for the `play` command now uses `createErrorEmbed`.

## [2.6.65] - 2026-04-09

### Added

- **resilient `/play` stream bridge**: `playerFactory` now uses a 3-stage fallback (`createResilientStream`) — SoundCloud with cleaned `title + author`, SoundCloud with title only, then direct `playdl.stream(track.url)` against the source URL. Spam-uploader channels (Best Songs, NCS, etc.) skip SoundCloud stages entirely. Every stage emits `debugLog` so bridge failures surface in Sentry with full context. Fixes the silent playback failure for kpop, niche, and indie tracks where the previous single-point SoundCloud lookup returned nothing and emitted `NoResultError` after the "Now Playing" embed had already been sent.
- **`searchQueryCleaner` utility** (`packages/bot/src/utils/music/searchQueryCleaner.ts`): shared `cleanTitle`, `cleanAuthor`, `cleanSearchQuery`, and `isSpamChannel` helpers. Expanded `NOISE_PATTERNS` now cover `[Download]`, `(Official)`, `(Music Video)`, `(HD)`, `(4K)`, `(Remastered YYYY)`, `(Extended Mix)`, pipe separators, empty bracket pairs, and VEVO suffixes. `queueManipulation.ts` imports from the shared cleaner instead of maintaining its own local copy.
- **upgraded now-playing embed** (`buildPlayResponseEmbed`): three response kinds — `nowPlaying`, `addedToQueue`, `playlistQueued` — chosen automatically based on queue state. Detects source platform (Spotify / YouTube / SoundCloud / Apple Music / Vimeo) via `track.source` or URL sniffing and applies the platform's brand color. Shows track thumbnail, clickable title, author, duration, source label, queue position (for `addedToQueue`), and requester tag + avatar in the footer. Playlist responses show playlist title + track count.

### Fixed

- **`/play` queue position display**: `queuePosition` now reflects the track's actual final slot in the queue (found by id) rather than the snapshot queue length, which was wrong when `moveUserTrackToPriority` or `blendAutoplayTracks` had already reordered tracks.
- **SoundCloud match predicate**: `findMatchingSoundCloudResult` now requires all non-empty tokens of the cleaned query to be present in the candidate string (token-based AND), preventing short result names from falsely matching longer queries via substring inclusion.
- **playlist embed URL**: the `playlistQueued` embed branch now sets `embed.setURL(playlist.url)` only when a playlist URL exists, and no longer falls through to `track.url`.

## [2.6.64] - 2026-04-07

### Added

- **scheduled weekly mod digest**: `/digest schedule <channel>` now persists a weekly automated digest configuration in Redis and posts a sample digest immediately so moderators can confirm the channel works. A new in-process scheduler ticks every hour, picks up due guilds, and delivers the digest via the same shared embed builder used by `/digest view`. `/digest unschedule` removes the schedule. The scheduler is single-flight (overlapping ticks short-circuit), isolates per-guild errors so one bad guild can't break the loop, validates `MOD_DIGEST_TICK_INTERVAL_MS` and `MOD_DIGEST_PERIOD_DAYS` env vars, and starts independently of the rest of the ready handler so an unrelated upstream failure can't suppress weekly digests.

### Changed

- **`/digest view` accuracy**: switched the view subcommand from a 500-row recent-cases truncation to a date-bounded `getCasesSince(cutoff)` query that matches the scheduler. The 7d/30d/90d period now returns exactly the cases inside the window regardless of how many cases the guild has. Backed by a new `moderation_cases(guildId, createdAt)` composite index so the query is index-served.

## [2.6.63] - 2026-04-07

### Added

- **named music sessions**: `/session save|restore|list|delete <name>` lets each guild keep up to 10 named queue snapshots in Redis (30-day TTL) alongside the existing auto-snapshot system. Restore and delete subcommands expose autocomplete so saved session names are one keystroke away.
- **cross-module dashboard overview**: the frontend overview page now renders Recent Music, Level Leaderboard, and Starboard Highlights sections gated by RBAC module access, turning the dashboard into a real guild command center instead of a moderation-only summary.

### Fixed

- **production YouTube playback**: the YoutubeiExtractor silently failed in production because the `youtube-dl-exec` transitive dependency was missing from the bot package after an upstream bump. It is now an explicit dependency and the extractor failure no longer reaches users as `NoResultError: Could not extract stream for this track`.
- **command availability hardening**: command bootstrap no longer depends on eager Prisma initialization from `moderationSettings`, so slash commands such as `/version` and `/autoplay` stay available even when unrelated shared service modules would otherwise fail during import.
- **version command accuracy**: `/version` now prefers the runtime package version (`npm_package_version`) and falls back to the root `package.json`, avoiding stale `packages/bot/package.json` version output after releases.

### Changed

- **Spotify-first search priority**: `/play` and autoplay seed searches now try `SPOTIFY_SEARCH` before falling back to `AUTO` and `YOUTUBE_SEARCH`, so a query for a song title matches the actual track instead of an hour-long YouTube compilation with a similar name. URL inputs still bypass this and use `AUTO` directly.
- **autoplay recommendation quality**: seed queries are now cleaned of YouTube noise (`(Official Video)`, `- Topic`, `ft.`, etc.), results longer than 10 minutes are filtered out, results over 7 minutes are score-penalized, and an artist-level broad fallback runs when the seed search returns no viable candidates. Scoring also widens the "similar energy" duration window and keeps a small bonus in the near range.
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
