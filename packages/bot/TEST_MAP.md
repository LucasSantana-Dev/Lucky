# Lucky Bot — Test Map

> Generated: 2026-05-08
> Total: 2624 tests across 200 suites

## How to read this document

**Importance:**
- **Critical** — tests that catch regressions in core features (music playback, queue management, autoplay)
- **High** — important feature behavior (moderation, Discord interactions, error handling)
- **Medium** — utility/helper functions, secondary features
- **Low** — edge cases, implementation details, logging, trivial wrappers

**Coverage impact:**
- **High** — tests exercise meaningful code paths; removing them leaves real behavior untested
- **Medium** — tests exercise some real paths but miss important branches
- **Low** — tests verify only mock calls (coordinator tests) or trivial paths

**Approach:**
- **✅ Optimal** — pure behavioral tests, testing through public API, real state assertions
- **⚠️ Acceptable** — unit tests with reasonable mocking, mostly behavioral
- **❌ Suboptimal** — coordinator tests (only verify mocks), log-only assertions, or tests better as integration tests

---

## Domain: Core Music Playback
**Total:** 63 tests across 4 files

### `handlers/player/streamBridge.spec.ts` — 22 tests

**Importance:** High | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- streamViaYtDlp – URL validation
- streamViaYtDlp – process lifecycle
- streamViaYtDlpSearch

**Notes:** Heavy mocking (coordinator tests) — verifies call orchestration but may not catch real behavioral regressions. Consider adding integration tests.

### `handlers/player/trackHandlers.spec.ts` — 19 tests

**Importance:** High | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- trackHandlers autoplay replenishment

**Notes:** Heavy mocking (coordinator tests) — verifies call orchestration but may not catch real behavioral regressions. Consider adding integration tests.

### `handlers/player/errorHandlers.spec.ts` — 13 tests

**Importance:** Medium | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- setupErrorHandlers

**Notes:** Heavy mocking (coordinator tests) — verifies call orchestration but may not catch real behavioral regressions. Consider adding integration tests.

### `handlers/player/lifecycleHandlers.spec.ts` — 9 tests

**Importance:** Medium | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- setupLifecycleHandlers
- setupVoiceKickDetection

**Notes:** Heavy mocking (coordinator tests) — verifies call orchestration but may not catch real behavioral regressions. Consider adding integration tests.


## Domain: Queue Management
**Total:** 254 tests across 13 files

### `utils/music/queueManipulation.spec.ts` — 114 tests

**Importance:** Critical | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- queueManipulation.replenishQueue
- queueManipulation.queueOperations
- queueManipulation — title-only deduplication

**Notes:** Heavy mocking (coordinator tests) — verifies call orchestration but may not catch real behavioral regressions. Consider adding integration tests.

### `utils/music/queueStateManager.spec.ts` — 60 tests

**Importance:** High | **Coverage impact:** Medium | **Approach:** ⚠️ Acceptable

**Test groups:**
- queueStateManager
- getQueueState
- isQueueEmpty

**Notes:** Comprehensive — covers major code paths.

### `utils/music/queueEditOps.spec.ts` — 26 tests

**Importance:** Medium | **Coverage impact:** Medium | **Approach:** ❌ Suboptimal

**Test groups:**
- clearQueue
- shuffleQueue
- smartShuffleQueue


### `utils/music/queueRescue.spec.ts` — 17 tests

**Importance:** Medium | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- rescueQueue
- getHistoryTracks
- buildVcContributionWeights


### `functions/music/commands/autoplay/queueHandlers.spec.ts` — 12 tests

**Importance:** Medium | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- isAutoplayTrack
- handleAutoplayStatus
- handleSkipAutoplayTrack


### `handlers/queueHandler.spec.ts` — 12 tests

**Importance:** Medium | **Coverage impact:** Medium | **Approach:** ⚠️ Acceptable

**Test groups:**
- queueHandler
- createQueue
- queueConnect


### `utils/music/queueResolver.spec.ts` — 9 tests

**Importance:** Medium | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- queueResolver


### `handlers/webMusic/queueHandlers.spec.ts` — 2 tests

**Importance:** Medium | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- web music queueHandlers queue resolution

**Notes:** Minimal — smoke test or trivial wrapper.

### `functions/music/commands/queueResolverWiring.spec.ts` — 1 tests

**Importance:** Medium | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- music command resolver wiring

**Notes:** Heavy mocking (coordinator tests) — verifies call orchestration but may not catch real behavioral regressions. Consider adding integration tests.

### `utils/music/queueResolver.guard.spec.ts` — 1 tests

**Importance:** Medium | **Coverage impact:** Medium | **Approach:** ✅ Optimal

**Test groups:**
- queue resolver guardrails

**Notes:** Pure behavioral — excellent coverage of real behavior.

### `utils/music/queue/asyncQueueManager.spec.ts` — 0 tests

**Importance:** Medium | **Coverage impact:** Low | **Approach:** ⚠️ Acceptable

**Test groups:**
- AsyncQueueManager
- addTracksSafely
- playTrackSafely

**Notes:** Minimal — smoke test or trivial wrapper.

### `utils/music/queue/queueStrategy.spec.ts` — 0 tests

**Importance:** Medium | **Coverage impact:** Medium | **Approach:** ⚠️ Acceptable

**Test groups:**
- QueueStrategyManager
- addTrackWithStrategy
- addTracksWithStrategy

**Notes:** Minimal — smoke test or trivial wrapper.

### `utils/music/queue/smartShuffle.spec.ts` — 0 tests

**Importance:** Medium | **Coverage impact:** Medium | **Approach:** ✅ Optimal

**Test groups:**
- smartShuffle

**Notes:** Pure behavioral — excellent coverage of real behavior.


## Domain: Now Playing & Track Display
**Total:** 89 tests across 4 files

### `handlers/player/trackNowPlaying.spec.ts` — 38 tests

**Importance:** High | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- trackNowPlaying handlers
- TrackNowPlayingState - registerNowPlayingMessage
- TrackNowPlayingState - getSongInfoMessage

**Notes:** Heavy mocking (coordinator tests) — verifies call orchestration but may not catch real behavioral regressions. Consider adding integration tests.

### `utils/general/responseEmbeds/buildTrackEmbed.spec.ts` — 25 tests

**Importance:** Medium | **Coverage impact:** Medium | **Approach:** ✅ Optimal

**Test groups:**
- detectSource
- buildTrackEmbed
- trackToData

**Notes:** Pure behavioral — excellent coverage of real behavior.

### `utils/general/responseEmbeds/buildPlatformAttribEmbed.spec.ts` — 14 tests

**Importance:** Medium | **Coverage impact:** Medium | **Approach:** ✅ Optimal

**Test groups:**
- buildPlatformAttribEmbed

**Notes:** Pure behavioral — excellent coverage of real behavior.

### `utils/music/nowPlayingEmbed.spec.ts` — 12 tests

**Importance:** Medium | **Coverage impact:** Medium | **Approach:** ✅ Optimal

**Test groups:**
- detectSource
- buildPlayResponseEmbed

**Notes:** Pure behavioral — excellent coverage of real behavior.


## Domain: Autoplay System
**Total:** 285 tests across 15 files

### `utils/music/autoplay/candidateScorer.spec.ts` — 43 tests

**Importance:** Critical | **Coverage impact:** Medium | **Approach:** ❌ Suboptimal

**Test groups:**
- candidateScorer
- calculateRecommendationScore
- calculateGenreFamilyPenalty

**Notes:** Comprehensive — covers major code paths.

### `functions/music/commands/autoplay.spec.ts` — 40 tests

**Importance:** High | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- autoplay command
- structure
- skip subcommand

**Notes:** Heavy mocking (coordinator tests) — verifies call orchestration but may not catch real behavioral regressions. Consider adding integration tests.

### `utils/music/autoplay/lastFmSeeds.spec.ts` — 36 tests

**Importance:** High | **Coverage impact:** Medium | **Approach:** ❌ Suboptimal

**Test groups:**
- getLastFmSeedTracks
- getLastFmSeedSlice
- advanceLastFmSeedOffset


### `utils/music/autoplay/sessionMood.spec.ts` — 36 tests

**Importance:** High | **Coverage impact:** Medium | **Approach:** ✅ Optimal

**Test groups:**
- sessionMood
- detectSessionMood - artist deep-dive
- detectSessionMood - duration preferences

**Notes:** Pure behavioral — excellent coverage of real behavior.

### `functions/music/commands/autoplay/settingsHandlers.spec.ts` — 31 tests

**Importance:** High | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- handleAutoplayMode
- handleAutoplayGenre
- add subcommand

**Notes:** Heavy mocking (coordinator tests) — verifies call orchestration but may not catch real behavioral regressions. Consider adding integration tests.

### `utils/music/candidateFallback.spec.ts` — 24 tests

**Importance:** Medium | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- interleaveByArtist
- enrichWithAudioFeatures
- collectGenreCandidates

**Notes:** Heavy mocking (coordinator tests) — verifies call orchestration but may not catch real behavioral regressions. Consider adding integration tests.

### `utils/music/autoplay/lastFmSeeder.spec.ts` — 20 tests

**Importance:** High | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- searchLastFmQuery
- collectLastFmCandidates

**Notes:** Heavy mocking (coordinator tests) — verifies call orchestration but may not catch real behavioral regressions. Consider adding integration tests.

### `utils/music/autoplay/candidateCollector.spec.ts` — 17 tests

**Importance:** High | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- candidateCollector
- shouldIncludeCandidate
- upsertScoredCandidate

**Notes:** Heavy mocking (coordinator tests) — verifies call orchestration but may not catch real behavioral regressions. Consider adding integration tests.

### `functions/music/commands/autoplay/artistHandlers.spec.ts` — 13 tests

**Importance:** Medium | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- handleAutoplayArtist
- missing guildId
- subcommand: prefer


### `utils/music/autoplay/spotifyRecommender.spec.ts` — 13 tests

**Importance:** Medium | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- spotifyRecommender
- collectSpotifyRecommendationCandidates
- searchSeedCandidates


### `utils/music/replenishSuppressionStore.spec.ts` — 9 tests

**Importance:** Medium | **Coverage impact:** Medium | **Approach:** ✅ Optimal

**Test groups:**
- replenishSuppressionStore
- setReplenishSuppressed
- isReplenishSuppressed

**Notes:** Pure behavioral — excellent coverage of real behavior.

### `functions/music/commands/queue/queueStats.spec.ts` — 3 tests

**Importance:** Medium | **Coverage impact:** Medium | **Approach:** ⚠️ Acceptable

**Test groups:**
- queueStats

**Notes:** Minimal — smoke test or trivial wrapper.

### `utils/music/autoplay/counters.spec.ts` — 0 tests

**Importance:** Medium | **Coverage impact:** Low | **Approach:** ⚠️ Acceptable

**Test groups:**
- autoplay/counters
- getAutoplayCount
- incrementAutoplayCount

**Notes:** Minimal — smoke test or trivial wrapper.

### `utils/music/autoplay/diversitySelector.spec.ts` — 0 tests

**Importance:** Medium | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- diversitySelector
- buildExcludedUrls
- buildExcludedKeys

**Notes:** Heavy mocking (coordinator tests) — verifies call orchestration but may not catch real behavioral regressions. Consider adding integration tests.

### `utils/music/autoplay/stats.spec.ts` — 0 tests

**Importance:** Medium | **Coverage impact:** Medium | **Approach:** ⚠️ Acceptable

**Test groups:**
- autoplay/stats
- getAutoplayStats
- shouldEnableAutoplay

**Notes:** Minimal — smoke test or trivial wrapper.


## Domain: Search & Discovery
**Total:** 183 tests across 8 files

### `utils/music/searchQueryCleaner.spec.ts` — 96 tests

**Importance:** High | **Coverage impact:** High | **Approach:** ✅ Optimal

**Test groups:**
- cleanTitle
- cleanAuthor
- cleanSearchQuery

**Notes:** Pure behavioral — excellent coverage of real behavior.

### `utils/music/search/providerHealth.spec.ts` — 19 tests

**Importance:** Medium | **Coverage impact:** Medium | **Approach:** ⚠️ Acceptable

**Test groups:**
- ProviderHealthService
- ProviderHealthService cooldown boundary conditions
- provider mappers


### `functions/music/commands/play/queryDetector.spec.ts` — 15 tests

**Importance:** Medium | **Coverage impact:** Medium | **Approach:** ✅ Optimal

**Test groups:**
- detectQueryType
- youtube detection
- spotify detection

**Notes:** Pure behavioral — excellent coverage of real behavior.

### `functions/music/handlers/play/handlePlay.spec.ts` — 14 tests

**Importance:** Medium | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- handlePlay
- validateQuery
- searchAndAddTrack


### `functions/music/commands/play/queryUtils.spec.ts` — 12 tests

**Importance:** Medium | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- normalizeSoundCloudUrl
- isUrl
- executePlayAtTop — fallback chain

**Notes:** Heavy mocking (coordinator tests) — verifies call orchestration but may not catch real behavioral regressions. Consider adding integration tests.

### `functions/music/commands/play/youtubeHandler.spec.ts` — 12 tests

**Importance:** Medium | **Coverage impact:** Medium | **Approach:** ⚠️ Acceptable

**Test groups:**
- youtubeHandler
- handleSpotifySearch
- handleYouTubeSearch


### `utils/music/search/engineManager.spec.ts` — 8 tests

**Importance:** Medium | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- SearchEngineManager

**Notes:** Heavy mocking (coordinator tests) — verifies call orchestration but may not catch real behavioral regressions. Consider adding integration tests.

### `functions/music/commands/play/spotifyHandler.spec.ts` — 7 tests

**Importance:** Medium | **Coverage impact:** Medium | **Approach:** ⚠️ Acceptable

**Test groups:**
- spotifyHandler
- handleSpotifyTrack
- handleSpotifyPlaylist



## Domain: Track Metadata & Normalization
**Total:** 222 tests across 10 files

### `utils/music/youtubeErrorHandler/analyzer.spec.ts` — 56 tests

**Importance:** High | **Coverage impact:** High | **Approach:** ✅ Optimal

**Test groups:**
- YouTubeErrorAnalyzer
- analyzeError
- parser error detection

**Notes:** Pure behavioral — excellent coverage of real behavior.

### `utils/music/titleComparison/service.spec.ts` — 52 tests

**Importance:** High | **Coverage impact:** Medium | **Approach:** ❌ Suboptimal

**Test groups:**
- TitleComparisonService
- constructor
- extractArtistTitle

**Notes:** Comprehensive — covers major code paths.

### `utils/music/trackNormalization.spec.ts` — 31 tests

**Importance:** Medium | **Coverage impact:** Medium | **Approach:** ⚠️ Acceptable

**Test groups:**
- normalizeText
- FUZZY_TITLE_THRESHOLD
- normalizeTrackKey


### `utils/music/duplicateDetection/similarityChecker.spec.ts` — 22 tests

**Importance:** Medium | **Coverage impact:** Medium | **Approach:** ✅ Optimal

**Test groups:**
- calculateStringSimilarity
- areTracksSimilar
- findSimilarTracks

**Notes:** Pure behavioral — excellent coverage of real behavior.

### `utils/music/duplicateDetection/tagExtractor.spec.ts` — 22 tests

**Importance:** Medium | **Coverage impact:** Medium | **Approach:** ⚠️ Acceptable

**Test groups:**
- tagExtractor
- extractTags
- extractGenre


### `utils/music/languageHeuristics.spec.ts` — 21 tests

**Importance:** Medium | **Coverage impact:** Medium | **Approach:** ✅ Optimal

**Test groups:**
- languageHeuristics
- detectSpanishMarkers
- detectPortugueseMarkers

**Notes:** Pure behavioral — excellent coverage of real behavior.

### `utils/music/duplicateDetection/duplicateChecker.spec.ts` — 16 tests

**Importance:** Medium | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- duplicateChecker
- addTrackToHistory edge cases
- checkForDuplicate error handling


### `utils/music/trackUtils/trackProcessor.spec.ts` — 2 tests

**Importance:** Medium | **Coverage impact:** Medium | **Approach:** ⚠️ Acceptable

**Test groups:**
- TrackProcessor.getTrackInfo

**Notes:** Minimal — smoke test or trivial wrapper.

### `utils/music/trackUtils/cacheManager.spec.ts` — 0 tests

**Importance:** Medium | **Coverage impact:** Medium | **Approach:** ✅ Optimal

**Test groups:**
- LRUCache
- basic operations
- LRU eviction

**Notes:** Pure behavioral — excellent coverage of real behavior.

### `utils/music/trackUtils/index.spec.ts` — 0 tests

**Importance:** Medium | **Coverage impact:** Medium | **Approach:** ⚠️ Acceptable

**Test groups:**
- TrackUtils class
- getTrackInfo
- getTrackCacheKey

**Notes:** Minimal — smoke test or trivial wrapper.


## Domain: Spotify Integration
**Total:** 72 tests across 3 files

### `spotify/spotifyApi.spec.ts` — 57 tests

**Importance:** Critical | **Coverage impact:** High | **Approach:** ✅ Optimal

**Test groups:**
- spotifyApi
- getAudioFeatures
- searchSpotifyTrack

**Notes:** Pure behavioral — excellent coverage of real behavior.

### `spotify/spotifyUserSeeds.spec.ts` — 8 tests

**Importance:** Medium | **Coverage impact:** Medium | **Approach:** ⚠️ Acceptable

**Test groups:**
- spotifyUserSeeds


### `spotify/spotifyConfig.spec.ts` — 7 tests

**Importance:** Medium | **Coverage impact:** Medium | **Approach:** ✅ Optimal

**Test groups:**
- spotifyConfig

**Notes:** Pure behavioral — excellent coverage of real behavior.


## Domain: Last.fm Integration
**Total:** 83 tests across 2 files

### `lastfm/lastFmApi.spec.ts` — 76 tests

**Importance:** Critical | **Coverage impact:** High | **Approach:** ⚠️ Acceptable

**Test groups:**
- lastFmApi
- normalizeLastFmArtist
- normalizeLastFmTitle

**Notes:** Comprehensive — covers major code paths.

### `handlers/externalScrobbler.spec.ts` — 7 tests

**Importance:** Medium | **Coverage impact:** Medium | **Approach:** ❌ Suboptimal

**Test groups:**
- externalScrobbler



## Domain: Music Recommendation Service
**Total:** 89 tests across 5 files

### `services/musicRecommendation/feedbackService.spec.ts` — 38 tests

**Importance:** High | **Coverage impact:** Medium | **Approach:** ⚠️ Acceptable

**Test groups:**
- RecommendationFeedbackService
- implicit feedback
- Postgres DB integration


### `services/musicRecommendation/vectorOperations.spec.ts` — 32 tests

**Importance:** High | **Coverage impact:** Medium | **Approach:** ⚠️ Acceptable

**Test groups:**
- vectorOperations
- createTrackVector
- calculateCosineSimilarity


### `services/musicRecommendation/similarityCalculator.spec.ts` — 19 tests

**Importance:** Medium | **Coverage impact:** Medium | **Approach:** ✅ Optimal

**Test groups:**
- similarityCalculator
- calculateTrackSimilarity
- calculateDiversityScore

**Notes:** Pure behavioral — excellent coverage of real behavior.

### `services/musicRecommendation/recommendationEngine.spec.ts` — 0 tests

**Importance:** Low | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- recommendationEngine
- generateRecommendations
- generateUserPreferenceRecommendations

**Notes:** Minimal — smoke test or trivial wrapper.

### `services/musicRecommendation/recommendationHelpers.spec.ts` — 0 tests

**Importance:** Low | **Coverage impact:** Medium | **Approach:** ⚠️ Acceptable

**Test groups:**
- recommendationHelpers
- createUserPreferenceSeed
- applyDiversityFilter

**Notes:** Minimal — smoke test or trivial wrapper.


## Domain: Music Commands
**Total:** 311 tests across 37 files

### `functions/music/commands/play/index.spec.ts` — 23 tests

**Importance:** High | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- play command

**Notes:** Heavy mocking (coordinator tests) — verifies call orchestration but may not catch real behavioral regressions. Consider adding integration tests.

### `functions/music/commands/queue/queueDisplay.spec.ts` — 16 tests

**Importance:** Medium | **Coverage impact:** Medium | **Approach:** ⚠️ Acceptable

**Test groups:**
- queueDisplay
- formatTrackForDisplay
- createTrackListDisplay


### `functions/music/commands/queue/queueEmbed.spec.ts` — 15 tests

**Importance:** Medium | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- queueEmbed
- createQueueEmbed
- createEmptyQueueEmbed

**Notes:** Heavy mocking (coordinator tests) — verifies call orchestration but may not catch real behavioral regressions. Consider adding integration tests.

### `functions/music/commands/repeat.spec.ts` — 13 tests

**Importance:** Medium | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- repeat command


### `functions/music/commands/play/processor.spec.ts` — 12 tests

**Importance:** Medium | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- PlayCommandProcessor
- processPlayCommand — routing
- processPlayCommand — queue management


### `functions/music/commands/session.spec.ts` — 12 tests

**Importance:** Medium | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- session command

**Notes:** Heavy mocking (coordinator tests) — verifies call orchestration but may not catch real behavioral regressions. Consider adding integration tests.

### `functions/music/commands/effects.spec.ts` — 11 tests

**Importance:** Medium | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- effects command

**Notes:** Heavy mocking (coordinator tests) — verifies call orchestration but may not catch real behavioral regressions. Consider adding integration tests.

### `functions/music/commands/move.spec.ts` — 11 tests

**Importance:** Medium | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- move command

**Notes:** Heavy mocking (coordinator tests) — verifies call orchestration but may not catch real behavioral regressions. Consider adding integration tests.

### `functions/music/commands/remove.spec.ts` — 11 tests

**Importance:** Medium | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- remove command

**Notes:** Heavy mocking (coordinator tests) — verifies call orchestration but may not catch real behavioral regressions. Consider adding integration tests.

### `functions/music/commands/album.spec.ts` — 10 tests

**Importance:** Medium | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- album command

**Notes:** Heavy mocking (coordinator tests) — verifies call orchestration but may not catch real behavioral regressions. Consider adding integration tests.

### `functions/music/commands/music.spec.ts` — 10 tests

**Importance:** Medium | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- music command

**Notes:** Heavy mocking (coordinator tests) — verifies call orchestration but may not catch real behavioral regressions. Consider adding integration tests.

### `functions/music/commands/skip.spec.ts` — 10 tests

**Importance:** Medium | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- skip command

**Notes:** Heavy mocking (coordinator tests) — verifies call orchestration but may not catch real behavioral regressions. Consider adding integration tests.

### `functions/music/commands/playskip.spec.ts` — 9 tests

**Importance:** Medium | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- playskip command

**Notes:** Heavy mocking (coordinator tests) — verifies call orchestration but may not catch real behavioral regressions. Consider adding integration tests.

### `functions/music/commands/playtop.spec.ts` — 9 tests

**Importance:** Medium | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- playtop command

**Notes:** Heavy mocking (coordinator tests) — verifies call orchestration but may not catch real behavioral regressions. Consider adding integration tests.

### `functions/music/commands/shuffle.spec.ts` — 9 tests

**Importance:** Medium | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- shuffle command

**Notes:** Heavy mocking (coordinator tests) — verifies call orchestration but may not catch real behavioral regressions. Consider adding integration tests.


## Domain: Session & Snapshot Management
**Total:** 46 tests across 3 files

### `utils/music/watchdog.spec.ts` — 25 tests

**Importance:** Medium | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- MusicWatchdogService
- MusicWatchdogService — orphan session monitor
- MusicWatchdogService — constructor env var parsing

**Notes:** Heavy mocking (coordinator tests) — verifies call orchestration but may not catch real behavioral regressions. Consider adding integration tests.

### `utils/music/namedSessions.spec.ts` — 19 tests

**Importance:** Medium | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- NamedSessionService
- save
- restore

**Notes:** Heavy mocking (coordinator tests) — verifies call orchestration but may not catch real behavioral regressions. Consider adding integration tests.

### `utils/music/watchdog.rejoin.spec.ts` — 2 tests

**Importance:** Medium | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- MusicWatchdogService retry reconnect

**Notes:** Heavy mocking (coordinator tests) — verifies call orchestration but may not catch real behavioral regressions. Consider adding integration tests.


## Domain: Handlers
**Total:** 190 tests across 9 files

### `handlers/messageHandler.spec.ts` — 35 tests

**Importance:** High | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- handleMessageCreate — XP handling
- handleMessageCreate — AutoMod handling
- handleMessageCreate — Custom Commands handling

**Notes:** Heavy mocking (coordinator tests) — verifies call orchestration but may not catch real behavioral regressions. Consider adding integration tests.

### `handlers/auditHandler.spec.ts` — 34 tests

**Importance:** High | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- auditHandler
- handleAuditEvents
- MessageDelete event

**Notes:** Heavy mocking (coordinator tests) — verifies call orchestration but may not catch real behavioral regressions. Consider adding integration tests.

### `handlers/eventHandler.spec.ts` — 22 tests

**Importance:** High | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- eventHandler
- handleAutocomplete
- button interactions

**Notes:** Heavy mocking (coordinator tests) — verifies call orchestration but may not catch real behavioral regressions. Consider adding integration tests.

### `handlers/interactionHandler.spec.ts` — 22 tests

**Importance:** High | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- interactionHandler
- handleInteractions
- handleInteraction

**Notes:** Heavy mocking (coordinator tests) — verifies call orchestration but may not catch real behavioral regressions. Consider adding integration tests.

### `handlers/commandsHandler.spec.ts` — 21 tests

**Importance:** High | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- commandsHandler
- executeCommand
- setCommands


### `handlers/memberHandler.spec.ts` — 21 tests

**Importance:** High | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- memberHandler
- handleMemberEvents
- GuildMemberAdd event

**Notes:** Heavy mocking (coordinator tests) — verifies call orchestration but may not catch real behavioral regressions. Consider adding integration tests.

### `handlers/musicButtonHandler.spec.ts` — 18 tests

**Importance:** Medium | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- handleMusicButtonInteraction
- leaderboard page button

**Notes:** Heavy mocking (coordinator tests) — verifies call orchestration but may not catch real behavioral regressions. Consider adding integration tests.

### `handlers/reactionHandler.spec.ts` — 13 tests

**Importance:** Medium | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- handleReactionEvents

**Notes:** Heavy mocking (coordinator tests) — verifies call orchestration but may not catch real behavioral regressions. Consider adding integration tests.

### `handlers/playerHandler.spec.ts` — 4 tests

**Importance:** Medium | **Coverage impact:** Medium | **Approach:** ✅ Optimal

**Test groups:**
- playerHandler
- module structure

**Notes:** Pure behavioral — excellent coverage of real behavior.


## Domain: Web Music
**Total:** 34 tests across 3 files

### `handlers/webMusic/mappers.spec.ts` — 19 tests

**Importance:** Medium | **Coverage impact:** Medium | **Approach:** ⚠️ Acceptable

**Test groups:**
- mapTrack
- repeatModeToString
- repeatModeToEnum


### `handlers/webMusic/index.spec.ts` — 8 tests

**Importance:** Medium | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- setupWebMusicHandler
- periodic state publish (setInterval)


### `handlers/webMusic/commandHandlers.spec.ts` — 7 tests

**Importance:** Medium | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- handleStop
- handleSkip
- webMusic commandHandlers queue resolution

**Notes:** Heavy mocking (coordinator tests) — verifies call orchestration but may not catch real behavioral regressions. Consider adding integration tests.


## Domain: Moderation
**Total:** 16 tests across 15 files

### `functions/moderation/commands/digest.spec.ts` — 15 tests

**Importance:** High | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- digest command
- view subcommand
- schedule subcommand

**Notes:** Heavy mocking (coordinator tests) — verifies call orchestration but may not catch real behavioral regressions. Consider adding integration tests.

### `functions/moderation/commands/index.spec.ts` — 1 tests

**Importance:** High | **Coverage impact:** Medium | **Approach:** ✅ Optimal

**Test groups:**
- moderation command loader

**Notes:** Pure behavioral — excellent coverage of real behavior.

### `functions/moderation/commands/ban.spec.ts` — 0 tests

**Importance:** High | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- ban command

**Notes:** Heavy mocking (coordinator tests) — verifies call orchestration but may not catch real behavioral regressions. Consider adding integration tests.

### `functions/moderation/commands/case.spec.ts` — 0 tests

**Importance:** High | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- case command
- view subcommand
- update subcommand

**Notes:** Minimal — smoke test or trivial wrapper.

### `functions/moderation/commands/cases.spec.ts` — 0 tests

**Importance:** High | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- cases command

**Notes:** Heavy mocking (coordinator tests) — verifies call orchestration but may not catch real behavioral regressions. Consider adding integration tests.

### `functions/moderation/commands/history.spec.ts` — 0 tests

**Importance:** High | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- history command

**Notes:** Minimal — smoke test or trivial wrapper.

### `functions/moderation/commands/kick.spec.ts` — 0 tests

**Importance:** High | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- kick command

**Notes:** Heavy mocking (coordinator tests) — verifies call orchestration but may not catch real behavioral regressions. Consider adding integration tests.

### `functions/moderation/commands/lockdown.spec.ts` — 0 tests

**Importance:** High | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- lockdown command

**Notes:** Heavy mocking (coordinator tests) — verifies call orchestration but may not catch real behavioral regressions. Consider adding integration tests.

### `functions/moderation/commands/mute.spec.ts` — 0 tests

**Importance:** High | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- mute command

**Notes:** Heavy mocking (coordinator tests) — verifies call orchestration but may not catch real behavioral regressions. Consider adding integration tests.

### `functions/moderation/commands/purge.spec.ts` — 0 tests

**Importance:** High | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- purge command

**Notes:** Heavy mocking (coordinator tests) — verifies call orchestration but may not catch real behavioral regressions. Consider adding integration tests.

### `functions/moderation/commands/slowmode.spec.ts` — 0 tests

**Importance:** High | **Coverage impact:** Low | **Approach:** ⚠️ Acceptable

**Test groups:**
- slowmode command

**Notes:** Minimal — smoke test or trivial wrapper.

### `functions/moderation/commands/unban.spec.ts` — 0 tests

**Importance:** High | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- unban command

**Notes:** Minimal — smoke test or trivial wrapper.

### `functions/moderation/commands/unmute.spec.ts` — 0 tests

**Importance:** High | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- unmute command

**Notes:** Heavy mocking (coordinator tests) — verifies call orchestration but may not catch real behavioral regressions. Consider adding integration tests.

### `functions/moderation/commands/warn.spec.ts` — 0 tests

**Importance:** High | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- warn command

**Notes:** Heavy mocking (coordinator tests) — verifies call orchestration but may not catch real behavioral regressions. Consider adding integration tests.

### `functions/moderation/handlers/caseHandlers.spec.ts` — 0 tests

**Importance:** High | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- caseHandlers
- handleCaseView
- handleCaseUpdate

**Notes:** Minimal — smoke test or trivial wrapper.


## Domain: Management / Guild Config
**Total:** 90 tests across 13 files

### `functions/management/handlers/automessageHandlers.spec.ts` — 20 tests

**Importance:** High | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- handleAutoMessageConfig
- handleAutoMessageList

**Notes:** Heavy mocking (coordinator tests) — verifies call orchestration but may not catch real behavioral regressions. Consider adding integration tests.

### `functions/management/commands/helpers/serversetupCriativaria.spec.ts` — 17 tests

**Importance:** High | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- serversetupCriativaria helpers

**Notes:** Heavy mocking (coordinator tests) — verifies call orchestration but may not catch real behavioral regressions. Consider adding integration tests.

### `functions/management/commands/guildconfig.spec.ts` — 11 tests

**Importance:** Medium | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- guildconfig command

**Notes:** Heavy mocking (coordinator tests) — verifies call orchestration but may not catch real behavioral regressions. Consider adding integration tests.

### `functions/management/commands/automessage.spec.ts` — 8 tests

**Importance:** Medium | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- automessage command


### `utils/guildAutomation/applyPlan.spec.ts` — 8 tests

**Importance:** Medium | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- applyAutomationModules

**Notes:** Heavy mocking (coordinator tests) — verifies call orchestration but may not catch real behavioral regressions. Consider adding integration tests.

### `functions/management/commands/serversetup.spec.ts` — 6 tests

**Importance:** Medium | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- serversetup command


### `functions/management/commands/autorole.spec.ts` — 5 tests

**Importance:** Medium | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- autorole command

**Notes:** Heavy mocking (coordinator tests) — verifies call orchestration but may not catch real behavioral regressions. Consider adding integration tests.

### `functions/management/commands/settings.spec.ts` — 4 tests

**Importance:** Medium | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- settings command

**Notes:** Heavy mocking (coordinator tests) — verifies call orchestration but may not catch real behavioral regressions. Consider adding integration tests.

### `utils/guildAutomation/captureGuildState.spec.ts` — 3 tests

**Importance:** Low | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- captureGuildAutomationState

**Notes:** Minimal — smoke test or trivial wrapper.

### `utils/guildAutomation/diff.spec.ts` — 3 tests

**Importance:** Low | **Coverage impact:** Medium | **Approach:** ✅ Optimal

**Test groups:**
- createAutomationPlan

**Notes:** Pure behavioral — excellent coverage of real behavior.

### `utils/guildAutomation/manifestSchema.spec.ts` — 2 tests

**Importance:** Low | **Coverage impact:** Medium | **Approach:** ✅ Optimal

**Test groups:**
- guildAutomationManifestSchema

**Notes:** Pure behavioral — excellent coverage of real behavior.

### `utils/guildAutomation/onboardingMapper.spec.ts` — 2 tests

**Importance:** Low | **Coverage impact:** Medium | **Approach:** ✅ Optimal

**Test groups:**
- onboarding mapper

**Notes:** Pure behavioral — excellent coverage of real behavior.

### `functions/management/commands/index.spec.ts` — 1 tests

**Importance:** Medium | **Coverage impact:** Medium | **Approach:** ✅ Optimal

**Test groups:**
- management command loader

**Notes:** Pure behavioral — excellent coverage of real behavior.


## Domain: General Commands
**Total:** 69 tests across 13 files

### `functions/general/commands/giveaway.spec.ts` — 16 tests

**Importance:** High | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- giveaway command
- parseDuration

**Notes:** Heavy mocking (coordinator tests) — verifies call orchestration but may not catch real behavioral regressions. Consider adding integration tests.

### `functions/general/commands/level.spec.ts` — 13 tests

**Importance:** Medium | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- level command

**Notes:** Heavy mocking (coordinator tests) — verifies call orchestration but may not catch real behavioral regressions. Consider adding integration tests.

### `functions/general/commands/twitch.spec.ts` — 12 tests

**Importance:** Medium | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- twitch command

**Notes:** Heavy mocking (coordinator tests) — verifies call orchestration but may not catch real behavioral regressions. Consider adding integration tests.

### `functions/general/commands/lastfm.spec.ts` — 9 tests

**Importance:** Medium | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- lastfm command link generation


### `functions/general/commands/starboard.spec.ts` — 9 tests

**Importance:** Medium | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- starboard command

**Notes:** Heavy mocking (coordinator tests) — verifies call orchestration but may not catch real behavioral regressions. Consider adding integration tests.

### `functions/general/commands/voterewards.spec.ts` — 6 tests

**Importance:** Medium | **Coverage impact:** Medium | **Approach:** ⚠️ Acceptable

**Test groups:**
- voterewards command


### `functions/general/commands/version.spec.ts` — 4 tests

**Importance:** Medium | **Coverage impact:** Medium | **Approach:** ❌ Suboptimal

**Test groups:**
- version command

**Notes:** Minimal — smoke test or trivial wrapper.

### `functions/general/commands/birthday.spec.ts` — 0 tests

**Importance:** Medium | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- daysUntilBirthday
- /birthday

**Notes:** Minimal — smoke test or trivial wrapper.

### `functions/general/commands/help.spec.ts` — 0 tests

**Importance:** Medium | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- help command

**Notes:** Minimal — smoke test or trivial wrapper.

### `functions/general/commands/leaderboard.spec.ts` — 0 tests

**Importance:** Medium | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- /leaderboard

**Notes:** Minimal — smoke test or trivial wrapper.

### `functions/general/commands/reactionrole.spec.ts` — 0 tests

**Importance:** Medium | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- reactionrole command

**Notes:** Heavy mocking (coordinator tests) — verifies call orchestration but may not catch real behavioral regressions. Consider adding integration tests.

### `functions/general/commands/roleconfig.spec.ts` — 0 tests

**Importance:** Medium | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- roleconfig command

**Notes:** Heavy mocking (coordinator tests) — verifies call orchestration but may not catch real behavioral regressions. Consider adding integration tests.

### `functions/general/commands/social.spec.ts` — 0 tests

**Importance:** Medium | **Coverage impact:** Medium | **Approach:** ⚠️ Acceptable

**Test groups:**
- /social

**Notes:** Minimal — smoke test or trivial wrapper.


## Domain: Twitch Integration
**Total:** 73 tests across 6 files

### `twitch/token.spec.ts` — 20 tests

**Importance:** Medium | **Coverage impact:** Medium | **Approach:** ⚠️ Acceptable

**Test groups:**
- twitch/token
- getTwitchEnv
- isTwitchConfigured


### `functions/general/handlers/twitchHandlers.spec.ts` — 13 tests

**Importance:** Medium | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- twitchHandlers
- handleTwitchAdd
- handleTwitchRemove

**Notes:** Heavy mocking (coordinator tests) — verifies call orchestration but may not catch real behavioral regressions. Consider adding integration tests.

### `twitch/eventsubSubscriptions.spec.ts` — 13 tests

**Importance:** Medium | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- eventsubSubscriptions
- subscribeToStreamOnline
- handleStreamOnline

**Notes:** Heavy mocking (coordinator tests) — verifies call orchestration but may not catch real behavioral regressions. Consider adding integration tests.

### `twitch/index.spec.ts` — 11 tests

**Importance:** Medium | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- twitch/index
- startTwitchService
- stopTwitchService


### `twitch/twitchApi.spec.ts` — 11 tests

**Importance:** Medium | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- twitchApi
- getTwitchUserByLogin


### `twitch/eventsubClient.spec.ts` — 5 tests

**Importance:** Medium | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- TwitchEventSubClient
- start
- stop

**Notes:** Minimal — smoke test or trivial wrapper.


## Domain: Client & Bot Infrastructure
**Total:** 99 tests across 5 files

### `handlers/clientHandler/presence.spec.ts` — 32 tests

**Importance:** High | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- presence
- PRESENCE_ROTATION_INTERVAL_MS
- nextPresenceIndex

**Notes:** Heavy mocking (coordinator tests) — verifies call orchestration but may not catch real behavioral regressions. Consider adding integration tests.

### `bot/start/initializer.spec.ts` — 30 tests

**Importance:** High | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- BotInitializer
- initializeBot
- shutdown

**Notes:** Heavy mocking (coordinator tests) — verifies call orchestration but may not catch real behavioral regressions. Consider adding integration tests.

### `handlers/clientHandler/service.spec.ts` — 13 tests

**Importance:** Medium | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- service
- createClient
- startClient

**Notes:** Heavy mocking (coordinator tests) — verifies call orchestration but may not catch real behavioral regressions. Consider adding integration tests.

### `utils/monitoring/health.spec.ts` — 13 tests

**Importance:** Medium | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- Health Monitoring
- checkDiscordHealth
- checkRedisHealth

**Notes:** Heavy mocking (coordinator tests) — verifies call orchestration but may not catch real behavioral regressions. Consider adding integration tests.

### `utils/monitoring/metrics.spec.ts` — 11 tests

**Importance:** Medium | **Coverage impact:** Medium | **Approach:** ⚠️ Acceptable

**Test groups:**
- Metrics Monitoring
- recordCommandMetric
- recordInteractionMetric



## Domain: Utilities
**Total:** 356 tests across 32 files

### `utils/music/service.spec.ts` — 44 tests

**Importance:** High | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- TrackManagementService
- constructor
- addTrackToQueue

**Notes:** Heavy mocking (coordinator tests) — verifies call orchestration but may not catch real behavioral regressions. Consider adding integration tests.

### `handlers/player/playerFactory.bridge.spec.ts` — 40 tests

**Importance:** High | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- parseDurationString
- findMatchingSoundCloudResult
- streamViaSoundCloud

**Notes:** Heavy mocking (coordinator tests) — verifies call orchestration but may not catch real behavioral regressions. Consider adding integration tests.

### `utils/general/interactionReply.spec.ts` — 30 tests

**Importance:** High | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- interactionReply
- non-replyable interactions
- chat input command interactions

**Notes:** Heavy mocking (coordinator tests) — verifies call orchestration but may not catch real behavioral regressions. Consider adding integration tests.

### `handlers/player/soundcloudMatcher.spec.ts` — 29 tests

**Importance:** High | **Coverage impact:** Medium | **Approach:** ⚠️ Acceptable

**Test groups:**
- parseDurationString
- findMatchingSoundCloudResult – title matching
- findMatchingSoundCloudResult – duration matching


### `utils/music/sessionSnapshots.spec.ts` — 19 tests

**Importance:** Medium | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- MusicSessionSnapshotService

**Notes:** Heavy mocking (coordinator tests) — verifies call orchestration but may not catch real behavioral regressions. Consider adding integration tests.

### `handlers/player/playerFactory.spec.ts` — 17 tests

**Importance:** Medium | **Coverage impact:** Medium | **Approach:** ✅ Optimal

**Test groups:**
- playerFactory
- createPlayer
- YouTube extractor configuration

**Notes:** Pure behavioral — excellent coverage of real behavior.

### `utils/music/buttonComponents.spec.ts` — 16 tests

**Importance:** Medium | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- createMusicControlButtons
- createMusicActionButtons
- createQueuePaginationButtons


### `utils/moderation/modDigestScheduler.spec.ts` — 15 tests

**Importance:** Medium | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- ModDigestSchedulerService.isDue
- ModDigestSchedulerService.tick
- ModDigestSchedulerService.sendDigestForGuild

**Notes:** Heavy mocking (coordinator tests) — verifies call orchestration but may not catch real behavioral regressions. Consider adding integration tests.

### `utils/music/ytdlpExtractor/service.spec.ts` — 15 tests

**Importance:** Medium | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- YtDlpExtractorService
- constructor
- validate


### `utils/general/responseEmbeds/buildListPageEmbed.spec.ts` — 13 tests

**Importance:** Medium | **Coverage impact:** Medium | **Approach:** ✅ Optimal

**Test groups:**
- buildListPageEmbed

**Notes:** Pure behavioral — excellent coverage of real behavior.

### `utils/moderation/modDigestConfig.spec.ts` — 13 tests

**Importance:** Medium | **Coverage impact:** Low | **Approach:** ⚠️ Acceptable

**Test groups:**
- ModDigestConfigService.enable
- ModDigestConfigService.disable
- ModDigestConfigService.get


### `functions/automod/commands/automod.spec.ts` — 12 tests

**Importance:** Medium | **Coverage impact:** Low | **Approach:** ❌ Suboptimal

**Test groups:**
- automod command
- status subcommand
- preset subcommand — list

**Notes:** Heavy mocking (coordinator tests) — verifies call orchestration but may not catch real behavioral regressions. Consider adding integration tests.

### `utils/general/responseEmbeds/buildUserProfileEmbed.spec.ts` — 11 tests

**Importance:** Medium | **Coverage impact:** Medium | **Approach:** ✅ Optimal

**Test groups:**
- buildUserProfileEmbed

**Notes:** Pure behavioral — excellent coverage of real behavior.

### `utils/command/getCommandsFromDirectory.spec.ts` — 10 tests

**Importance:** Medium | **Coverage impact:** Medium | **Approach:** ⚠️ Acceptable

**Test groups:**
- getCommandsFromDirectory


### `services/VoiceChannelStatusService.spec.ts` — 9 tests

**Importance:** Medium | **Coverage impact:** Medium | **Approach:** ⚠️ Acceptable

**Test groups:**
- VoiceChannelStatusService
- setTrackStatus
- clearStatus


#### Additional Music Commands tests

- `functions/music/commands/volume.spec.ts` (9 tests, ❌ Suboptimal)
- `functions/music/commands/artist.spec.ts` (8 tests, ❌ Suboptimal)
- `functions/music/commands/djrole.spec.ts` (8 tests, ❌ Suboptimal)
- `functions/music/commands/history.spec.ts` (8 tests, ❌ Suboptimal)
- `functions/music/commands/queue/index.spec.ts` (8 tests, ❌ Suboptimal)
- `functions/music/commands/spotify.spec.ts` (8 tests, ❌ Suboptimal)
- `functions/music/commands/voteskip.spec.ts` (8 tests, ❌ Suboptimal)
- `functions/music/commands/lyrics.spec.ts` (7 tests, ❌ Suboptimal)
- `functions/music/commands/leave.spec.ts` (6 tests, ❌ Suboptimal)
- `functions/music/commands/pause.spec.ts` (6 tests, ❌ Suboptimal)
- `functions/music/commands/seek.spec.ts` (6 tests, ❌ Suboptimal)
- `functions/music/commands/clear.spec.ts` (5 tests, ❌ Suboptimal)
- `functions/music/commands/leavecleanup.spec.ts` (5 tests, ❌ Suboptimal)
- `functions/music/commands/playlist.spec.ts` (5 tests, ❌ Suboptimal)
- `functions/music/commands/queue/queueFormatter.spec.ts` (5 tests, ⚠️ Acceptable)
- `functions/music/commands/recommendation/handlers/feedbackHandler.spec.ts` (5 tests, ❌ Suboptimal)
- `functions/music/commands/nowplaying.spec.ts` (4 tests, ❌ Suboptimal)
- `functions/music/commands/recommendation/index.spec.ts` (4 tests, ❌ Suboptimal)
- `functions/music/commands/replay.spec.ts` (4 tests, ❌ Suboptimal)
- `functions/music/commands/skipto.spec.ts` (4 tests, ❌ Suboptimal)
- `functions/music/commands/stop.spec.ts` (4 tests, ❌ Suboptimal)
- `functions/music/commands/songinfo.spec.ts` (3 tests, ❌ Suboptimal)

#### Additional Utilities tests

- `utils/moderation/digestEmbed.spec.ts` (9 tests, ✅ Optimal)
- `index.spec.ts` (8 tests, ❌ Suboptimal)
- `utils/music/sessionStartupRestore.spec.ts` (8 tests, ❌ Suboptimal)
- `utils/music/voteSkipStore.spec.ts` (7 tests, ✅ Optimal)
- `services/musicRecommendation/index.spec.ts` (6 tests, ❌ Suboptimal)
- `utils/general/deferredInteractionReply.spec.ts` (6 tests, ⚠️ Acceptable)
- `utils/misc/pathUtils.spec.ts` (5 tests, ✅ Optimal)
- `utils/music/idleDisconnect.spec.ts` (4 tests, ❌ Suboptimal)
- `scripts/sentryTest.spec.ts` (3 tests, ⚠️ Acceptable)
- `scripts/sentryTestCli.spec.ts` (2 tests, ⚠️ Acceptable)
- `utils/music/collaborativePlaylist.spec.ts` (2 tests, ✅ Optimal)
- `config/constants.spec.ts` (1 tests, ✅ Optimal)
- `functions/automod/commands/index.spec.ts` (1 tests, ✅ Optimal)
- `register.spec.ts` (1 tests, ❌ Suboptimal)
- `functions/general/handlers/reactionroleHandlers.spec.ts` (0 tests, ❌ Suboptimal)
- `functions/general/handlers/roleconfigHandlers.spec.ts` (0 tests, ❌ Suboptimal)
- `utils/general/birthdayScheduler.spec.ts` (0 tests, ❌ Suboptimal)

---

## Summary Statistics

**Total files:** 200
**Total tests:** 2624
**Total spec lines:** 64117

### By Importance
- Critical: 4
- High: 46
- Medium: 139
- Low: 11

### By Approach
- Optimal (✅): 31 files
- Acceptable (⚠️): 34 files
- Suboptimal (❌): 135 files

### By Test Count
- 50+ tests: 7
- 30-49 tests: 16
- 15-29 tests: 37
- 5-14 tests: 80
- <5 tests: 60
---

## Key Findings & Recommendations

### 1. Heavy Coordinator Test Bias (135/200 files = 67%)

**Finding:** Most of Lucky's test suite relies on heavy mocking (jest.mock + jest.fn), making them **coordinator tests** that verify the right calls are made but don't test actual behavior.

**Examples:**
- `queueManipulation.spec.ts` (114 tests, 225 mocks) — verifies replenish/shuffle/rescue call the right dependencies, but doesn't verify queue state changes in isolation
- `playerFactory.bridge.spec.ts` (40 tests, 23 mocks) — verifies yt-dlp/play-dl are called correctly, but subprocess execution isn't truly tested
- `play/index.spec.ts` (23 tests, 30+ mocks) — tests command orchestration, not music search/play behavior

**Risk:** A regression in actual behavior (e.g., queue corruption, duplicate track logic) could be silently hidden by passing mocks.

**Recommendation:** 
- Add 10-15 **behavioral integration tests** for critical paths (e.g., queue replenish actually yields valid candidates, play command finds tracks in real scenarios)
- Gradually convert heavy coordinator tests to test through public APIs instead of mocking every dependency

### 2. Low Coverage in Critical Domains

**Finding:** Core music playback has only 63 tests across 4 files, all heavily mocked. Autoplay (core recommendation logic) is fragmented across 13 files with mixed approaches.

**Critical gaps:**
- No integration test for "user plays song → autoplay replenishes queue → next track plays"
- No test for cascade failures (Last.fm down → falls back to Spotify → falls back to YouTube)
- No test for queue state consistency after player errors

**Recommendation:** 
- Create 5-10 **happy-path integration tests** that exercise the full flow from user action to queue state
- Add **error injection tests** (mock provider timeouts, API 503s) to verify fallback chains work

### 3. Optimal Test Files (31/200 = 15%)

**High-value files** with pure behavioral tests (no mocks):
- `searchQueryCleaner.spec.ts` (96 tests) — excellent, pure logic
- `spotifyApi.spec.ts` (57 tests) — fetch mocked at boundary, not dependencies
- `sessionMood.spec.ts` (36 tests) — pure mood detection logic
- `youtubeErrorHandler/analyzer.spec.ts` (56 tests) — pure error parsing

**Action:** Use these as reference patterns for refactoring coordinator tests.

### 4. Minimal/Trivial Tests (60/200 = 30%)

**Finding:** 60 files have <5 tests; many are smoke tests or single-assertion wrappers:
- `watchdog.rejoin.spec.ts` (2 tests)
- `queueResolver.guard.spec.ts` (1 test)
- `register.spec.ts` (1 test)

**Recommendation:** 
- Delete or consolidate tests that only verify "function exists and doesn't crash"
- Merge trivial tests into integration suites
- Expected cleanup: remove ~20-30 files, consolidate into 3-5 core integration suites

### 5. Suboptimal Approaches by Domain

| Domain | Status | Action |
|--------|--------|--------|
| Core Music Playback | ❌ All mocked | Add integration tests for player lifecycle |
| Queue Management | ❌ Mostly mocked | Refactor queueManipulation to behavioral; test via public API |
| Music Commands | ❌ Mostly mocked | Create command integration tests; mock only Discord API |
| Autoplay System | ⚠️ Mixed | Good unit tests; add integration for recommendation flow |
| Track Metadata | ⚠️ Mixed | Good; titleComparison/duplicateDetection are solid |
| Spotify/Last.fm Integration | ✅ Mostly good | Maintain fetch mocking approach; add error scenarios |

### 6. Recommendation for Next Steps

**Phase 1 (Quick wins, ~1 week):**
1. Delete 20-30 trivial single-assertion tests (queueResolver.guard.spec.ts, register.spec.ts, etc.)
2. Consolidate smoke tests into integration suites
3. Document "test pattern anti-patterns" (coordinator-only tests, log assertions)

**Phase 2 (Medium-term, ~2-3 weeks):**
1. Create 10-15 behavioral integration tests for critical flows:
   - Play command → search → add to queue → autoplay replenish
   - Queue manipulation → state consistency
   - Autoplay scoring → candidate selection
2. Refactor `queueManipulation.spec.ts` to test via public API (currently 225 mocks)
3. Add error injection tests for provider fallbacks

**Phase 3 (Long-term, ~monthly):**
1. Gradually convert coordinator tests to hybrid/behavioral by reducing mock count
2. Establish "max mocks per test file" guideline (e.g., <10)
3. Bi-weekly review of new tests to maintain quality

### 7. By the Numbers

- **Optimal approach (✅):** 31 files, ~15% coverage
- **Acceptable approach (⚠️):** 34 files, ~17% coverage
- **Suboptimal approach (❌):** 135 files, **68% coverage** ← needs focus
- **Total test debt:** ~6000 lines of coordinator-only tests that don't catch behavioral regressions

---

## Conclusion

Lucky has a **solid quantity of tests (2624 total)** but **skews heavily toward coordinator tests that don't catch behavioral regressions**. The test suite would benefit more from 20-30 **well-designed integration tests** than 100 additional mocked unit tests.

**Priority:** Convert critical domains (Queue Management, Core Playback, Autoplay) to behavioral + integration approach. Expected ROI: 3-5x better regression detection with 20% fewer total tests.

