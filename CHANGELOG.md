# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.6.134] - 2026-04-17

### Added
- feat(frontend): Lucky neon-brand landing page redesign — prominent glowing maneki-neko hero, Sora/Manrope typography, lucide icons in colored orbs, pink/orange/purple neon palette, framer-motion micro-interactions with reduced-motion support, monospace stats with pulsing online dot (#693)
- feat(autoplay): genre preferences Wave A — per-guild genre seeds influence autoplay recommendations (#679)
- test(backend): comprehensive validate middleware unit tests (#689)

### Fixed
- fix(frontend): correct Discord application `client_id` on Add-to-Discord button — invite now opens the real Lucky bot authorize flow instead of showing "Unknown Application" (#692)

## [2.6.133] - 2026-04-17

### Added
- feat(music): voice channel status updates on track start (#660)
- feat(stats): public `/api/stats/public` endpoint + animated countup on landing page (#667)
- feat(autoplay): refactor — queueManipulation split into 6 autoplay modules (candidateScorer, diversitySelector, spotifyRecommender, lastFmSeeder, candidateCollector, replenisher) (#658, #659, #662, #668, #669, #670)

### Fixed
- fix(backend): SSE heartbeat leak on client disconnect — AbortController guard prevents writes to dead sockets (#666)
- fix(bot): LRU+TTL on audio-feature cache — prevents unbounded memory growth (#663)
- fix(bot): LRU+TTL on duplicate-detection caches — 4 module-level Maps now bounded (#672)
- fix(bot): LRU+TTL on trackNowPlaying state — class wrapper with cleanupGuild() hook (#675, #676)
- fix(bot): cleanup Discord listeners and connections on SIGTERM/SIGINT (#676)
- fix(music): skip/stop controls — compounding fixes verified (#677)
- fix(security): require `guildModuleAccess` middleware on roles + moderation routes (#664)
- fix(security): apiLimiter on 7 backend routes, writeLimiter on mutations (#673)
- fix(security): follow-redirects CVE-2024-45590 bumped via pnpm.overrides (#673)
- fix(security): TruffleHog action SHA-pinned to v3.94.3 (#673)
- test(backend): fix Express 5 integration test breakage (#681)

### Changed
- chore(sonar): exclude bot entry point + event handler glue from coverage measurement

## [2.6.132] - 2026-04-16

### Added
- Intermediate release bundling Phase 3 refactor completion and first wave of memory hygiene

## [2.6.131] - 2026-04-16

- feat(landing): marketing landing page at `/` with hero, feature grid, stats strip, FAQ, footer

## [2.6.130] - 2026-04-15

### Fixed
- Dockerfile.frontend now builds `@lucky/shared` + runs `prisma generate` before frontend build — unblocks main CI `Build & Push Docker Images` and fixes `Cannot find module @lucky/shared/constants` TS error

## [2.6.129] - 2026-04-15

### Fixed
- `/api/artists/suggestions` no longer returns empty 304 — added explicit `Cache-Control: no-cache, no-store, must-revalidate` header so browser refetches fresh suggestions instead of replaying a cached empty response

## [2.6.128] - 2026-04-15

### Fixed
- Autoplay history race: `buildExcludedUrls` now also reads the most-recent URL from the freshly-fetched persistent (Redis) history, closing a race where `queue.history` (in-memory) lagged behind Redis and the just-played track could be re-selected
- Bot leave-then-rejoin replaying the same song: watchdog orphan session recovery now passes `skipCurrentTrack: true` so the rejoin continues with the next queued track instead of restarting the last-playing one
- Preferred Artists: related artists no longer empty — Spotify deprecated `/v1/artists/{id}/related-artists` (403 for new apps); replaced with `/v1/recommendations?seed_artists=<id>` fallback that dedupes recommended track artists
- Preferred Artists detail panel now responsive: inline below grid on small viewports, sticky sidebar on `lg+`
- Preferred Artists batch save: single `PUT /api/artists/preferences/batch` replaces the per-artist PUT fan-out when saving multiple preferences

## [2.6.127] - 2026-04-15

### Changed
- Phase 4 code hygiene: consolidated duplicate Zod schemas (`guildIdParam`, `userIdParam`) into `packages/backend/src/schemas/common.ts`; extracted 17 Discord color constants + grouped API route builders into `@lucky/shared/constants` (subpath-only, no barrel pollution); added `logAndRethrow`/`logAndSwallow` error helpers and replaced 8 empty catch blocks across `lastFmApi` and `spotifyApi` with structured logging

## [2.6.126] - 2026-04-15

### Fixed
- Autoplay genre drift: added genre-family penalty that prevents rap/hip-hop sessions from picking electronic tracks (and other cross-genre drifts). 10 genre families (rap_hiphop, rnb_soul, electronic, rock_metal, pop, latin, country_folk, jazz_classical, world, ambient_chill) — candidates whose family doesn't overlap the current track's family receive -0.6 penalty (strong anchors: rap_hiphop, rock_metal, latin) or -0.3 (weak anchors), effectively dropping them below the selection threshold
- Autoplay Spanish-language drift: hard-rejects Spanish/Latin candidates (-2.0 score) when the last 20 tracks of session history contain no Spanish markers (accents, Spanish stopwords, latin genres) — fixes cases where English/hip-hop sessions picked random Spanish tracks
- Low-popularity + disjoint-genre belt-and-suspenders penalty (-0.4): rejects obscure tracks whose genres don't match session

## [2.6.125] - 2026-04-15

### Changed
- Preferred Artists: default suggestions bumped from 12 → 24 artists; grid layout is now 5 columns (desktop) / 4 (md) / 3 (sm) / 2 (mobile); artist circle images enlarged to 128px

### Fixed
- Backend: pass SPOTIFY_CLIENT_ID/SECRET/REDIRECT_URI/LINK_SECRET env vars to backend service in docker-compose so `/api/artists/suggestions` fallback can use Spotify client-credentials flow

## [2.6.124] - 2026-04-15

### Added
- Preferred Artists page: default suggestions grid (replaces empty search state), click-to-expand related artists (Spotify API), and batch "Save Preferences" button that commits multiple prefer/block selections at once
- Backend `GET /api/artists/suggestions`: returns 12 suggested artists from user's Spotify top artists (if OAuth linked) with fallback to popular artists search

### Fixed
- Sidebar active-link: `/music` no longer activates when navigating to `/music/artists` or other music sub-routes — uses exact match for /music specifically
- Preferred Artists batch save preserves artist metadata from search results so preferences aren't lost when search is cleared before saving
- Docker production image now includes workspace-local `node_modules` for bot and backend workspaces — root cause of v2.6.123 lru-cache ERR_MODULE_NOT_FOUND crash loop

## [2.6.123] - 2026-04-14

### Added
- `POST /api/internal/notify`: homelab-only endpoint for sending Discord notifications from the server (content + embeds, auth via `INTERNAL_API_KEY`)

### Changed
- Phase 1 dedupe: deleted 368 LOC of 95%-duplicate files — `queueStateManager.ts`, `downloadHelpers.ts`, and `errorSanitizer.ts` now have a single canonical location; `errorSanitizer` moved to `@lucky/shared`
- Phase 2 memory hygiene: replaced 4 unbounded module-level Maps with LRU caches — `artistPopularityCache` (max 5000, 24h TTL), `audioFeatureCache` (max 10000, 24h TTL), duplicate-detection caches (max 1000, 1h TTL), and now-playing caches (max 500, 4h TTL); prevents long-running-bot memory growth

### Fixed
- CI: `Deploy to Homelab` workflow converted to manual-dispatch-only (no webhook listener was running on server — was failing silently on every push)

## [2.6.122] - 2026-04-14

### Fixed
- Music controls: Skip and Stop buttons no longer replay the just-skipped track after a 10–20 s silence — four compounding issues addressed in one atomic change
  - Autoplay replenish now respects explicit stop/clear: `handleStop`, `handleClear`, and web Stop/Clear actions set a 30 s per-guild suppression flag that short-circuits `replenishIfAutoplay` so autoplay cannot refill the queue with the just-played track
  - `handlePlayerSkip` now awaits `addTrackToHistory` *before* invoking the autoplay replenish loop, eliminating a race where the recommendation engine read a stale exclusion set and returned the skipped track again
  - Stream-error recovery (`recoverFromStreamExtractionError`) detects when YouTube returns the same track URL or title as the alternative and skips without reinsert, preventing the 10 s "find alternative → it's the same → replay" loop on broken stream URLs
  - Web dashboard Skip no longer uses a fire-and-forget `setTimeout`; publishes state only after `queue.node.skip()` resolves, eliminating stale state visible to the frontend
- `recoverFromStreamExtractionError` now surfaces the `same track alternative` warnLog consistently whether any or all YouTube results match the current track

### Security
- Session secret: `WEBAPP_SESSION_SECRET` is now required — bot refuses to boot with the `'fallback-secret-change-in-production'` fallback (#620)
- OAuth CSRF: Discord OAuth callback now validates a cryptographically random `state` token generated at login (`crypto.randomBytes(32)`) via `crypto.timingSafeEqual`; mismatches are rejected and the token is deleted after a single use (#622)

## [2.6.121] - 2026-04-14

### Added
- Preferred Artists page (`/music/artists`): YouTube Music-style artist picker where users search for artists, view related artists, and mark them as preferred or blocked — preferences persist to Postgres and influence autoplay recommendations
- Autoplay VC blend: when multiple users are in voice, autoplay now blends preferred/blocked artist preferences from all VC members (union of all preferences) instead of only the user who requested the current track
- Preferred artists set via the web UI now sync to the bot's autoplay scoring (previously only bot `/recommendation prefer` command wrote to the scoring engine)

### Fixed
- Stop command: `/stop` and the web player Stop button now clear all queued tracks before deleting the queue — previously stopping mid-session would cause the same track to resume on the next `/play` command

## [2.6.120] - 2026-04-14

### Fixed
- Autoplay: hard-reject ambient/noise content (rain sounds, ocean waves, white noise, ASMR, sleep music, binaural beats, meditation music, spa/yoga music) and DJ mixes/EDM sets (DJ set, festival set, extended club mixes, trance/EDM mixes) — these were slipping through the candidate pipeline despite being unrelated to the session's genre

## [2.6.119] - 2026-04-14

### Added
- Feature toggles: per-guild toggle state now persisted in the database — toggling a feature for a server survives bot restarts and takes priority over Unleash/fallback values; failed toggle updates surface as toast errors in the UI instead of silently discarding the change

### Fixed
- Autoplay genre drift: Spotify `/v1/recommendations` now receives `min_energy`/`max_energy`, `min_valence`/`max_valence`, and `min_danceability`/`max_danceability` constraints derived from the current track's audio features (±0.25 tolerance window) — prevents the algorithm from drifting to electro/EDM tracks when the session is playing reggaeton or forró with similar energy but a different genre profile
- Web music player: player now syncs with the bot's actual state when opening the app mid-playback — bot broadcasts state every 30 s for active queues, SSE writes are wrapped in try/catch to handle client disconnects, and the SSE connection lifecycle correctly ignores stale callbacks after component unmount
- Webapp sidebar: active tab highlighting fixed — `startsWith` was causing both `/music` and `/music/history` to highlight simultaneously; now uses exact match with `path + '/'` prefix fallback
- Track history: removed hardcoded 50-track cap; backend now accepts `offset` param and returns total count, enabling full pagination of the history list
- Server logs: pagination total count now comes from the server's actual log count instead of the current page slice length, fixing page range display
- Twitch notifications: added `GET /api/twitch/status` endpoint and pre-check in the UI — when Twitch API credentials are not configured, a clear banner is shown and the Add button is disabled instead of returning a generic 503

## [2.6.118] - 2026-04-14

### Added
- Music player: second button row with Stop, Clear Queue, and Clear Autoplay buttons — Stop deletes the queue and clears the player embed, Clear Queue removes all queued tracks, Clear Autoplay disables autoplay mode and refreshes the button state

### Fixed
- Autoplay dedup: Spotify returns the same song under different author metadata for different releases (e.g. `"DJ Jesh FSC"` vs `"DJ Jesh FSC, MC Biel"`) — `normalizeTrackKey` now strips comma-separated collaborators and `feat./ft./con./with` suffixes before normalizing, so both variants map to the same dedup key and are no longer queued twice
- `SpotifyAuthService`: extracted `fetchJson<T>` helper to reduce cyclomatic complexity and eliminate duplicated fetch/error-handling boilerplate in `exchangeCodeForToken`

## [2.6.117] - 2026-04-14

### Fixed
- `/queue` command crash: embed field value is now clamped to Discord's 1024-character limit — Spotify track URLs are longer than YouTube URLs so queues with many tracks overflowed the limit and were rejected by `EmbedBuilder.addFields` with "Received one or more errors"
- Queue track titles truncated to 40 chars in the track list to keep lines compact

## [2.6.116] - 2026-04-14

### Fixed
- Replaced built-in `SpotifyExtractor` from `@discord-player/extractor` with the community-maintained `discord-player-spotify` package — the built-in extractor has a confirmed unfixed bug (discord-player#1988) where text searches return 0 results despite valid credentials, causing every `/play` text query to fall back to YouTube

## [2.6.115] - 2026-04-13

### Fixed
- Autoplay dedup: `extractSongCore` no longer clips song names at a ` - ` separator that appears inside a parenthetical — e.g. `Nutshell (MTV Unplugged - HD Video)` now correctly extracts `Nutshell` instead of `Nutshell (MTV Unplugged`
- Autoplay dedup: `noiseTerms.json` adds `unplugged`, `mtv unplugged`, and `hd video` as version variants so parentheticals like `(MTV Unplugged)` and `(HD Video)` are stripped before key normalisation — prevents live/unplugged variants of a track from appearing as separate recommendations
- Play command: duplicate "Now Playing" embed eliminated — `/play` now pre-registers its deferred reply message so the `playerStart` handler edits it to the "Now Playing" embed instead of sending a second message

## [2.6.114] - 2026-04-13

### Added
- Autoplay: Spotify `/v1/recommendations` API integrated as the first candidate source — when the user has a linked Spotify account, the bot seeds the endpoint with up to 5 Spotify track IDs from the current queue, fetches 15 musically similar recommendations, then searches discord-player for each result. Spotify recommendation candidates receive a +0.3 score boost over standard seed-based candidates, so musically coherent picks reliably surface ahead of YouTube text-search results.

## [2.6.113] - 2026-04-13

### Fixed
- Autoplay dedup: fuzzy title matching via Levenshtein similarity (threshold 0.82) wired into `isDuplicateCandidate` — misspellings and minor title variants (e.g. "Sirens" vs "Syrens") are now caught as duplicates instead of slipping through exact-key checks
- Autoplay dedup: history window expanded from 100 to 150 tracks, reducing the chance of recently-played songs re-entering the candidate pool

## [2.6.112] - 2026-04-13

### Fixed
- Autoplay: candidates with `durationMS > 15 minutes` are now hard-rejected (`-Infinity` score) — 7-hour looped YouTube uploads no longer slip through the previous `-0.2` penalty
- Autoplay dedup: `(Tributo ao X)`, `[Tributo...]`, `(Homenagem a X)`, and `(HH:MM:SS)` duration annotations stripped from titles before key normalisation — tribute/fan-annotated versions of now-playing track now correctly deduplicated
- Autoplay quality: tracks whose resolved title contains `legendado`, `traduzido`, `tradução`, or `legendas` receive a `-0.4` "low quality upload" penalty, discouraging YouTube fan-upload junk even when Spotify fallback fires
- Autoplay source: Spotify score boost raised from `+0.15` to `+0.4` so Spotify candidates decisively beat YouTube fallbacks
- `noiseTerms.json`: added `legendas` to `bareTitleNoise`

## [2.6.111] - 2026-04-13

### Fixed
- Crash on startup: `import noiseTerms from './noiseTerms.json'` was missing the `with { type: 'json' }` import attribute required by Node.js 22 ESM — bot crashed immediately on every start

## [2.6.110] - 2026-04-13

### Fixed
- Autoplay session coherence: Last.fm candidates no longer receive the +0.15 session novelty boost, preventing off-genre tracks from the user's global listening history (e.g. Kanye West during a FNAF session) from outscoring on-session seed-based candidates
- Autoplay session drift: `getSessionOriginTrack()` finds the oldest user-added (non-autoplay) track in queue history and keeps it permanently in the seed pool — the original song that started the session always anchors recommendations even after many songs have played
- Autoplay diagnostics: `searchSeedCandidates` now logs `spotifyQuery` when Spotify returns 0 results and includes both `spotifyQuery` and `fallbackQuery` in the fallback warn log, making it diagnosable in production

## [2.6.109] - 2026-04-13

### Fixed
- Autoplay dedup: bare "Tradução" / "traduzido" in titles now stripped before key normalization, so "YE - FATHER Tradução" no longer bypasses the dedup check against "YE - FATHER"
- Autoplay: `purgeDuplicatesOfCurrentTrack()` runs at each replenish cycle start and removes any upcoming-queue entries that duplicate the now-playing track, eliminating stale duplicates that were added before the current song started
- Autoplay diversity: `LASTFM_SCORE_BOOST` reduced from 0.1 to 0.0 so Last.fm novelty candidates no longer outscore seed-based candidates — prevents unrelated-genre tracks from being injected into an otherwise coherent session

## [2.6.108] - 2026-04-13

### Fixed
- Last.fm seed tracks crashed silently with `TypeError: Cannot read properties of undefined (reading 'toLowerCase')` because `user.getrecenttracks` and `user.getlovedtracks` return `artist: { '#text': '...' }` instead of `{ name: '...' }`. Code now reads `#text` first, falling back to `name`. This was disabling all Last.fm-based autoplay diversity, causing the same songs to repeat
- `/play`, `/playnow`, `/playtop`: primary Spotify error is now logged (was swallowed), making diagnosis possible
- `executePlayAtTop` (`/playnow`, `/playtop`): added Spotify → YouTube → SoundCloud fallback chain — previously had no fallback and would show an error embed if Spotify failed

## [2.6.107] - 2026-04-13

### Fixed
- Autoplay: query modifiers (`similar`, `like`, `playlist`, `mix`) were appended to the Spotify search query on every non-first replenish cycle — Spotify treats these as literal terms and returns 0 results, causing silent fallback to YouTube. Spotify query now always uses the clean base query; modifiers are only sent to YouTube/AUTO engines
- Autoplay dedup: cover variant parentheticals `(Cover - ...)`, `(Cover by X)` etc. were not stripped before `coreKey` computation because the old pattern only matched the exact strings `(cover)` and `(cover version)`. Pattern broadened to `(cover[^)]*)` / `[cover[^\]]*]`; `cover` added to `HYPHENATED_VERSION_SUFFIXES` so `"Song - Cover"` hyphenated titles are also normalized

## [2.6.106] - 2026-04-13

### Fixed
- Autoplay diversity: studio recordings now preferred over acoustic/live/cover variants via a -0.2 score penalty on version-variant titles
- Autoplay diversity: current playing track's artist now counts toward the per-artist cap so at most one more track from the same artist is queued per replenish cycle
- Autoplay diversity: selected tracks are interleaved round-robin by artist before insertion, preventing consecutive tracks from the same artist

## [2.6.105] - 2026-04-13

### Fixed
- Autoplay: cover-channel seeds (e.g. "ANATOMIA - Eu sei que é você (Acústico ao vivo)" by "Carlo Gatto") now extract the real artist from the title's left side via `extractTitleArtistFromSong`, yielding a clean Spotify query instead of falling back to the YouTube channel name
- Autoplay dedup: Brazilian/Portuguese acoustic parentheticals `(Acústico...)` and `[Acústico...]` are now stripped from titles before normalization, so studio and acoustic versions of the same song share a dedup key and only one is queued

## [2.6.104] - 2026-04-13

### Fixed
- Autoplay: when the YouTube channel name equals the artist name (e.g. `"ANATOMIA - ao pressão (Visualizer)"` by author `"ANATOMIA"`), the Spotify query was previously assembled as `"ao pressão ANATOMIA"` (flipped), causing Spotify search to fail and fall back to YouTube. The Spotify engine now receives the cleaned title directly (`"ANATOMIA - ao pressão"`) which Spotify natively parses as `"Artist - Song"`, restoring correct Spotify-first playback for artist-named channels

## [2.6.103] - 2026-04-13

### Changed
- Autoplay: Spotify engine now receives a clean `"Song Artist"` query (extracted via `extractSongCore`) instead of the raw title which could duplicate the artist name (e.g. `"Beyoncé - Halo Beyoncé"` → `"Halo Beyoncé"`), significantly improving Spotify hit rate
- Autoplay: Spotify-sourced candidates now receive a consistent +0.15 score boost and are exempt from the same-source penalty, ensuring Spotify tracks are preferred over equivalent YouTube tracks when available

## [2.6.102] - 2026-04-13

### Fixed
- Autoplay dedup: same-song variants selected within a single replenish cycle (e.g. "Beyoncé - Halo" and "Halo - Beyoncé (Lyrics)") now correctly deduplicated via extractSongCore key in selectDiverseCandidates and addSelectedTracks
- Autoplay dedup: Brazilian/Portuguese version qualifiers ("Versão Forró", "Ao Vivo", "Forró") now stripped from track titles before normalization, preventing different versions of the same song from both being queued

## [2.6.101] - 2026-04-13

### Fixed

- Autoplay dedup now correctly identifies the same song across YouTube title format variants (e.g. "Beyoncé - Halo (Tradução/Legendado)", "Halo - Beyoncé (Lyrics)", "Beyoncé - Halo Lyrics #music") — Brazilian noise patterns strip Tradução, Legendado, Clipe Oficial, hashtags, and bare Lyrics; `extractSongCore` extracts the song portion from artist-prefixed or inverted titles using the author field to disambiguate

## [2.6.100] - 2026-04-13

### Added

- Spotify batch audio features: batch-fetch up to 100 track audio features in one API call and score candidates by energy/valence delta against the current track
- Artist popularity weighting: discover mode boosts low-popularity artists (≤40), popular mode boosts high-popularity artists (≥70)
- Album cohesion scoring: same-artist candidates with shared title tokens get a +0.12 bonus, otherwise take a −0.35 same-artist penalty
- Multi-user VC blend: contribution weights balance autoplay picks proportionally across all VC members' listening history

### Fixed

- `enrichWithAudioFeatures` no longer throws `TypeError` when Spotify token mock returns undefined
- Album cohesion threshold corrected from unreachable `> 0.4` to `> 0`
- Removed redundant `getTrackAudioFeatures` call per replenish cycle

## [2.6.99] - 2026-04-13

### Fixed

- Spotify-first provider: SpotifyExtractor registered before YouTube so text searches resolve via Spotify first
- Queue Error on bridge exhaustion: `Bridge exhausted` now triggers stream recovery (skip + Discord notification) instead of raw error embed
- Extractor registration: null return from `player.extractors.register()` now logs a warning instead of silently succeeding

## [2.6.98] - 2026-04-13

### Fixed

- Autoplay same-song repetition: fan-upload noise patterns strip decorators (`[K-POP IN PUBLIC]`, Korean/CJK parentheticals, `[Fancam]`, `[MPD*]`, `M/V`) from dedup keys so the same track with different YouTube titles deduplicates correctly
- Autoplay artist blocking removed: only song-level dedup remains — artists are no longer penalised for playing consecutive tracks

## [2.6.97] - 2026-04-13

### Added

- Intelligent autoplay signals: skip and completion tracking, loved tracks, artist frequency scoring, session mood detection, audio feature matching via Spotify API

## [2.6.93] - 2026-04-12

### Added

- Multi-user voice channel taste blend: `consumeBlendedSeedSlice` distributes seeds across all VC members, blend status shown in autoplay display

## [2.6.92] - 2026-04-12

### Added

- Autoplay artist preferences: `/autoplay artist prefer/block` — blocked artists score -∞, preferred artists score +0.3

## [2.6.91] - 2026-04-12

### Added

- Autoplay genre/mood filters: `/autoplay genre` fetches top tracks via Last.fm tag API, `autoplayGenres[]` stored per guild

## [2.6.90] - 2026-04-12

### Fixed

- Autoplay same-song dedup: normalized candidate keys, title-only dedup, regex version suffix detection for broader coverage

## [2.6.89] - 2026-04-12

### Fixed

- Autoplay full session history exclusion: 100-track lookback window, broader version suffix detection
- Autoplay: history dedup extended to 100 tracks, query variation added, `getSimilar` seeding diversified
- Autoplay subcommands added: queue reason display, replenish serialised per guild

## [2.6.88] - 2026-04-11

### Fixed

- Spotify OAuth account linking: SpotifyLink model, SpotifyLinkService, backend routes, `/spotify` command, frontend page

## [2.6.87] - 2026-04-11

### Fixed

- Autoplay repeats: per-guild mutex serializes concurrent replenish calls so race conditions no longer allow the same track to be selected twice
- Autoplay repeats: tracks added to queue are immediately written to Redis history so the next replenish call excludes them
- Autoplay: history lookback increased from 20 to 50 entries (~3h session coverage)

## [2.6.86] - 2026-04-11

### Fixed

- Autoplay dedup: YouTube video ID extracted from URL so www/youtu.be/short URLs all match the same exclusion
- Finished track now passed to replenishQueue so just-played song is excluded even when currentTrack already advanced
- CI: SonarCloud reverted to self-contained coverage (artifact sharing between concurrent workflows was causing 0%% coverage)

## [2.6.84] - 2026-04-11

### Fixed

- Provider priority: Spotify → YouTube → SoundCloud; no more SoundCloud-first resolution
- Duplicate Now Playing message eliminated — interaction reply is addedToQueue only
- Autoplay dedup: hyphenated version suffixes stripped (– Remaster, - Live, - Official Audio)
- /stop no longer triggers watchdog reconnect (intentional-stop window extended)
- Manual voice kick detected via voiceStateUpdate, marked intentional
- /skip last song no longer triggers reconnect via emptyQueue event
- Queue embed empty field guard prevents Discord API rejection

## [2.6.82] - 2026-04-10

### Fixed

- **Player recovery error logging** — catch blocks in stream recovery, bridge exhaustion, and Last.fm handlers now emit `debugLog`/`warnLog` instead of silently swallowing errors. Completes Phase 3 of the reliability audit.

## [2.6.81] - 2026-04-10

### Fixed

- **Player retry logging** — retry failures now emit `warnLog` with track title and guild ID instead of being silently swallowed.
- **Shared `QueueMetadata` type** — created `packages/bot/src/types/QueueMetadata.ts`; replaced 6+ scattered `IQueueMetadata` interfaces across `errorHandlers`, `trackHandlers`, `trackNowPlaying`, and `queueManipulation` with a single typed import.
- **Bridge fallback hardening** — unhealthy SoundCloud results are now skipped before they reach the extractor, reducing silent failures.

## [2.6.80] - 2026-04-10

### Fixed

- **Extractor errors now visible** — `DefaultExtractors.loadMulti()` and `initPlayDlAndRegisterYoutubei()` were `void`-called, silently swallowing load errors. Errors now surface via `errorLog`.
- **Dynamic Node.js path for yt-dlp** — replaced hardcoded `/usr/local/bin/node` with `process.execPath` so the correct runtime is detected on all deployments.
- **Stream race condition** — added `settled` guard in `streamViaYtDlp` so `close` firing before `data` cannot double-settle the promise.
- **YouTube recovery timeout** — `queue.player.search()` in stream recovery now has a 10s `Promise.race` timeout; a hung YouTube API no longer blocks the player indefinitely.

## [2.6.79] - 2026-04-10

### Fixed

- **Silent stream failures** — when `playerError` fires and all recovery paths are exhausted, the bot now sends an error embed to the guild text channel: "⚠️ Could not play track — [title] could not be streamed from any source." Previously nothing was shown.
- **yt-dlp stderr captured** — the first line of yt-dlp stderr (e.g. "Video unavailable in your country") is now included in the rejection message and visible in logs.
- **Bridge exhaustion logs** — added `cleanedTitle`, `url`, and `stages[]` array to `Bridge: all stages exhausted` error entries.

## [2.6.78] - 2026-04-10

### Fixed

- **Silent audio playback (critical)** — two root causes found and fixed:
  1. `streamViaYtDlp` consumed the first chunk from yt-dlp's stdout (the WebM EBML header `1a 45 df a3`) via `once('data')` and discarded it. discord-player/ffmpeg received a headerless stream and could not decode the codec, resulting in silence. Fixed with a `PassThrough` that re-injects the first chunk before piping the remainder.
  2. yt-dlp spawned without a JavaScript runtime (`node: unavailable`). Added `--js-runtimes node:/usr/local/bin/node` so YouTube extraction uses the full JS extractor and all audio formats are available.

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
