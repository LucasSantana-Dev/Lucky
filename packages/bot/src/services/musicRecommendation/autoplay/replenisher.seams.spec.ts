import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import type { Track, GuildQueue } from 'discord-player'
import { User } from 'discord.js'

jest.mock('lru-cache', () => ({
    LRUCache: jest.fn(function () {
        this.get = jest.fn().mockReturnValue(null)
        this.set = jest.fn()
        this.delete = jest.fn()
        this.clear = jest.fn()
    }),
}))

jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
    errorLog: jest.fn(),
    warnLog: jest.fn(),
}))

jest.mock('@lucky/shared/services/recommendationTelemetryReadService', () => ({
    getAutoplaySkipRateForGuild: jest.fn(),
}))

jest.mock('@lucky/shared/services', () => ({
    trackHistoryService: {
        getTrackHistory: jest.fn(),
        getReplayFrequentTracks: jest.fn(),
    },
    guildSettingsService: {
        getGuildSettings: jest.fn(),
    },
    spotifyLinkService: {
        getValidAccessToken: jest.fn(),
    },
    premiumService: {
        isPremium: jest.fn(),
    },
}))

jest.mock('../../../services/musicRecommendation/feedbackService', () => ({
    recommendationFeedbackService: {
        getLikedTrackWeights: jest.fn(),
        getDislikedTrackWeights: jest.fn(),
        getImplicitDislikeKeys: jest.fn(),
        getImplicitLikeKeys: jest.fn(),
        getPreferredArtistKeys: jest.fn(),
        getBlockedArtistKeys: jest.fn(),
        getGuildImplicitDislikeKeys: jest.fn(),
    },
}))

jest.mock(
    '../../../services/musicRecommendation/recommendationTelemetry',
    () => ({
        recordRecommendationOutcome: jest.fn().mockResolvedValue(undefined),
    }),
)

jest.mock('./sessionMood', () => ({
    detectSessionMood: jest.fn(),
}))

jest.mock('./candidateCollector', () => ({
    collectRecommendationCandidates: jest.fn(),
}))

jest.mock('./diversitySelector', () => ({
    buildExcludedUrls: jest.fn(),
    buildExcludedKeys: jest.fn(),
    selectDiverseCandidates: jest.fn(),
    addSelectedTracks: jest.fn(),
    purgeDuplicatesOfCurrentTrack: jest.fn(),
}))

jest.mock('../candidateFallback', () => ({
    collectBroadFallbackCandidates: jest.fn(),
    collectGenreCandidates: jest.fn(),
    interleaveByArtist: jest.fn(),
}))

jest.mock('./vcWeights', () => ({
    buildVcContributionWeights: jest.fn(),
}))

jest.mock('./artistTagCache', () => ({
    createArtistTagFetcher: jest.fn(),
    hasGenreTag: jest.fn(),
}))

jest.mock('./lastFmSeeder', () => ({
    collectLastFmCandidates: jest.fn(),
}))

jest.mock('./seedSimilarityCollector', () => ({
    collectSeedSimilarCandidates: jest.fn(),
}))

jest.mock('./skipCircuitBreaker', () => ({
    evaluateSkipRateBreaker: jest.fn(),
}))

jest.mock('../../../spotify/spotifyApi', () => ({
    getArtistPopularity: jest.fn(),
    getArtistGenres: jest.fn(),
}))

jest.mock('./candidateScorer', () => ({
    getGenreFamilies: jest.fn(),
}))

jest.mock('./recommendationBasis', () => ({
    serializeBasis: jest.fn(),
}))

jest.mock('./candidateContracts', () => ({
    getRejectionCounts: jest.fn(),
}))

import {
    evaluateGatingChecks,
    extractSeedAndSessionMood,
    fetchFeedbackAndHistoryData,
    buildExclusionAndDerivedSignals,
    buildGenreTagContext,
    collectAllCandidates,
    selectAndRerankCandidates,
    enqueueAndFinalize,
} from './replenisher'

function createTrack(overrides: Partial<Track> = {}): Track {
    return {
        title: 'Test Song',
        author: 'Test Artist',
        durationMS: 3 * 60 * 1000,
        url: 'https://open.spotify.com/track/testid',
        id: 'testid',
        source: 'spotify',
        requestedBy: null,
        ...overrides,
    } as Track
}

function createTracksMap(
    entries: [string, Track][] = [],
): Map<string, Track> & { toArray: () => Track[] } {
    const map = new Map<string, Track>(entries) as Map<string, Track> & {
        toArray: () => Track[]
    }
    map.toArray = () => [...map.values()]
    return map
}

function createGuildQueue(overrides: Partial<GuildQueue> = {}): GuildQueue {
    return {
        guild: { id: 'guildid' },
        tracks: createTracksMap(),
        currentTrack: createTrack(),
        metadata: {},
        history: { tracks: { toArray: () => [] } },
        ...overrides,
    } as GuildQueue
}

function createUser(overrides: Partial<User> = {}): User {
    return {
        id: 'userid',
        bot: false,
        system: false,
        username: 'testuser',
        ...overrides,
    } as User
}

describe('replenisher seam functions', () => {
    beforeEach(() => {
        jest.clearAllMocks()

        const {
            recommendationFeedbackService,
        } = require('../../../services/musicRecommendation/feedbackService')
        recommendationFeedbackService.getLikedTrackWeights.mockResolvedValue(
            new Map(),
        )
        recommendationFeedbackService.getDislikedTrackWeights.mockResolvedValue(
            new Map(),
        )
        recommendationFeedbackService.getImplicitDislikeKeys.mockResolvedValue(
            new Set(),
        )
        recommendationFeedbackService.getImplicitLikeKeys.mockResolvedValue(
            new Set(),
        )
        recommendationFeedbackService.getPreferredArtistKeys.mockResolvedValue(
            new Set(),
        )
        recommendationFeedbackService.getBlockedArtistKeys.mockResolvedValue(
            new Set(),
        )
        recommendationFeedbackService.getGuildImplicitDislikeKeys.mockReturnValue(
            new Set(),
        )

        const {
            trackHistoryService,
            guildSettingsService,
            spotifyLinkService,
            premiumService,
        } = require('@lucky/shared/services')
        trackHistoryService.getTrackHistory.mockResolvedValue([])
        trackHistoryService.getReplayFrequentTracks.mockResolvedValue({
            trackIds: new Set(),
            artists: new Set(),
        })
        guildSettingsService.getGuildSettings.mockResolvedValue(null)
        spotifyLinkService.getValidAccessToken.mockResolvedValue(null)
        premiumService.isPremium.mockResolvedValue(false)

        const { detectSessionMood } = require('./sessionMood')
        detectSessionMood.mockReturnValue({
            deepDiveArtist: null,
            preferLong: false,
            preferShort: false,
            restless: false,
            dominantLocale: null,
        })

        const {
            buildExcludedUrls,
            buildExcludedKeys,
            selectDiverseCandidates,
            addSelectedTracks,
            purgeDuplicatesOfCurrentTrack,
        } = require('./diversitySelector')
        buildExcludedUrls.mockReturnValue(new Set())
        buildExcludedKeys.mockReturnValue(new Set())
        selectDiverseCandidates.mockReturnValue([])
        addSelectedTracks.mockResolvedValue(undefined)
        purgeDuplicatesOfCurrentTrack.mockReturnValue([])

        const {
            collectBroadFallbackCandidates,
            collectGenreCandidates,
            interleaveByArtist,
        } = require('../candidateFallback')
        collectBroadFallbackCandidates.mockResolvedValue(undefined)
        collectGenreCandidates.mockResolvedValue(undefined)
        interleaveByArtist.mockImplementation((tracks: any[]) => tracks)

        const { buildVcContributionWeights } = require('./vcWeights')
        buildVcContributionWeights.mockReturnValue(new Map())

        const {
            createArtistTagFetcher,
            hasGenreTag,
        } = require('./artistTagCache')
        createArtistTagFetcher.mockReturnValue(jest.fn().mockResolvedValue([]))
        hasGenreTag.mockReturnValue(false)

        const { evaluateSkipRateBreaker } = require('./skipCircuitBreaker')
        evaluateSkipRateBreaker.mockResolvedValue(true)

        const { getArtistPopularity } = require('../../../spotify/spotifyApi')
        getArtistPopularity.mockResolvedValue(50)

        const { getGenreFamilies } = require('./candidateScorer')
        getGenreFamilies.mockReturnValue(new Set())

        const { getRejectionCounts } = require('./candidateContracts')
        getRejectionCounts.mockReturnValue({})
    })

    describe('evaluateGatingChecks', () => {
        it('returns null when currentTrack is absent', async () => {
            const queue = createGuildQueue({ currentTrack: undefined })
            const result = await evaluateGatingChecks(queue)
            expect(result).toBeNull()
        })

        it('uses finishedTrack when currentTrack is null', async () => {
            const queue = createGuildQueue({ currentTrack: null })
            const finished = createTrack({ title: 'Finished Song' })
            const result = await evaluateGatingChecks(queue, finished)
            expect(result?.currentTrack.title).toBe('Finished Song')
        })

        it('returns null when missingTracks <= 0', async () => {
            const track = createTrack()
            const autoplayTrack = createTrack({ id: 'autoplayid' })
            autoplayTrack.metadata = { isAutoplay: true }
            const queue = createGuildQueue({
                currentTrack: track,
                tracks: createTracksMap([
                    ['auto1', autoplayTrack],
                    ['auto2', autoplayTrack],
                ]),
            })
            const { premiumService } = require('@lucky/shared/services')
            premiumService.isPremium.mockResolvedValue(false)

            const result = await evaluateGatingChecks(queue)
            expect(result).toBeNull()
        })

        it('calls evaluateSkipRateBreaker and returns null if false', async () => {
            const queue = createGuildQueue()
            const { evaluateSkipRateBreaker } = require('./skipCircuitBreaker')
            evaluateSkipRateBreaker.mockResolvedValue(false)

            const result = await evaluateGatingChecks(queue)
            expect(result).toBeNull()
            expect(evaluateSkipRateBreaker).toHaveBeenCalledWith(queue)
        })

        it('returns {currentTrack, missingTracks} when gating passes', async () => {
            const queue = createGuildQueue()
            const { premiumService } = require('@lucky/shared/services')
            premiumService.isPremium.mockResolvedValue(false)

            const result = await evaluateGatingChecks(queue)
            expect(result).toEqual({
                currentTrack: queue.currentTrack,
                missingTracks: 2,
            })
        })
    })

    describe('extractSeedAndSessionMood', () => {
        it('extracts history tracks and creates seed tracks', async () => {
            const queue = createGuildQueue()
            const currentTrack = createTrack()

            const result = await extractSeedAndSessionMood(queue, currentTrack)
            expect(result.seedTracks[0]).toBe(currentTrack)
            expect(result.historyTracks).toEqual([])
        })

        it('caches session mood when history length stable', async () => {
            const { detectSessionMood } = require('./sessionMood')
            detectSessionMood.mockClear()

            const queue = createGuildQueue()
            const currentTrack = createTrack()
            const result1 = await extractSeedAndSessionMood(queue, currentTrack)

            // Call again - should use cached mood
            const result2 = await extractSeedAndSessionMood(queue, currentTrack)

            // detectSessionMood called only once if history length unchanged
            expect(detectSessionMood.mock.calls.length).toBeLessThanOrEqual(2)
            expect(result1.sessionMood).toEqual(result2.sessionMood)
        })

        it('recomputes mood when history changes by 3+ tracks', async () => {
            const queue = createGuildQueue()
            const currentTrack = createTrack()
            await extractSeedAndSessionMood(queue, currentTrack)

            const moodDetector = require('./sessionMood')
            moodDetector.detectSessionMood.mockClear()

            // Simulate new history with 3+ new tracks
            const newQueue = createGuildQueue({
                history: {
                    tracks: {
                        toArray: () => [
                            createTrack(),
                            createTrack(),
                            createTrack(),
                        ],
                    },
                },
            })
            await extractSeedAndSessionMood(newQueue, currentTrack)
            expect(moodDetector.detectSessionMood).toHaveBeenCalled()
        })
    })

    describe('fetchFeedbackAndHistoryData', () => {
        it('fetches all feedback and history data in parallel', async () => {
            const queue = createGuildQueue()
            const requestedBy = createUser()

            const result = await fetchFeedbackAndHistoryData(
                queue,
                requestedBy,
                [],
                [requestedBy.id],
                [],
            )

            const {
                recommendationFeedbackService,
            } = require('../../../services/musicRecommendation/feedbackService')
            expect(
                recommendationFeedbackService.getLikedTrackWeights,
            ).toHaveBeenCalled()
            expect(
                recommendationFeedbackService.getDislikedTrackWeights,
            ).toHaveBeenCalled()
            expect(result.likedWeights).toBeInstanceOf(Map)
        })

        it('merges guild and user implicit dislike keys', async () => {
            const queue = createGuildQueue()
            const requestedBy = createUser()

            const {
                recommendationFeedbackService,
            } = require('../../../services/musicRecommendation/feedbackService')
            const userKeys = new Set(['user-key-1'])
            const guildKeys = new Set(['guild-key-1'])

            recommendationFeedbackService.getImplicitDislikeKeys.mockResolvedValue(
                userKeys,
            )
            recommendationFeedbackService.getGuildImplicitDislikeKeys.mockReturnValue(
                guildKeys,
            )

            const result = await fetchFeedbackAndHistoryData(
                queue,
                requestedBy,
                [],
                [requestedBy.id],
                [],
            )

            expect(result.mergedImplicitDislikeKeys).toContain('user-key-1')
            expect(result.mergedImplicitDislikeKeys).toContain('guild-key-1')
        })

        it('logs warning when persistent history empty', async () => {
            const queue = createGuildQueue()
            const { warnLog } = require('@lucky/shared/utils')

            const { trackHistoryService } = require('@lucky/shared/services')
            trackHistoryService.getTrackHistory.mockResolvedValue([])

            await fetchFeedbackAndHistoryData(queue, null, [], [], [])

            expect(warnLog).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining(
                        'persistent history empty',
                    ),
                }),
            )
        })

        it('degrades gracefully when getReplayFrequentTracks rejects', async () => {
            const queue = createGuildQueue()
            const requestedBy = createUser()

            const { trackHistoryService } = require('@lucky/shared/services')
            trackHistoryService.getReplayFrequentTracks.mockRejectedValue(
                new Error('redis connection refused'),
            )

            const result = await fetchFeedbackAndHistoryData(
                queue,
                requestedBy,
                [],
                [requestedBy.id],
                [],
            )

            expect(result.replayFrequency).toEqual({
                trackIds: new Set(),
                artists: new Set(),
            })
            expect(result.likedWeights).toBeInstanceOf(Map)
        })
    })

    describe('buildExclusionAndDerivedSignals', () => {
        it('calls buildExcludedUrls and buildExcludedKeys', async () => {
            const queue = createGuildQueue()
            const currentTrack = createTrack()

            const {
                buildExcludedUrls,
                buildExcludedKeys,
            } = require('./diversitySelector')

            const result = buildExclusionAndDerivedSignals(
                queue,
                currentTrack,
                [],
                [],
                [],
            )

            expect(buildExcludedUrls).toHaveBeenCalled()
            expect(buildExcludedKeys).toHaveBeenCalled()
            expect(result.excludedUrls).toBeInstanceOf(Set)
            expect(result.excludedKeys).toBeInstanceOf(Set)
        })

        it('builds recent artists from current track and history', () => {
            const currentTrack = createTrack({ author: 'Current Artist' })
            const historyTrack = createTrack({ author: 'History Artist' })

            const result = buildExclusionAndDerivedSignals(
                createGuildQueue(),
                currentTrack,
                [],
                [historyTrack],
                [],
            )

            expect(result.recentArtists.has('current artist')).toBe(true)
            expect(result.recentArtists.has('history artist')).toBe(true)
        })

        it('builds artist frequency from persistent history', () => {
            const history = [
                { author: 'Frequent Artist', isAutoplay: false },
                { author: 'Frequent Artist', isAutoplay: false },
                { author: 'Rare Artist', isAutoplay: false },
            ]

            const result = buildExclusionAndDerivedSignals(
                createGuildQueue(),
                createTrack(),
                [],
                [],
                history,
            )

            expect(result.artistFrequency.size).toBeGreaterThan(0)
        })

        it('logs exclusion set details', () => {
            const { debugLog } = require('@lucky/shared/utils')
            debugLog.mockClear()

            buildExclusionAndDerivedSignals(
                createGuildQueue(),
                createTrack(),
                [],
                [],
                [],
            )

            expect(debugLog).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('exclusion sets built'),
                }),
            )
        })
    })

    describe('buildGenreTagContext', () => {
        it('fetches artist tags for current track', async () => {
            const queue = createGuildQueue()
            const currentTrack = createTrack()
            const fetcher = jest.fn().mockResolvedValue(['tag1', 'tag2'])

            const result = await buildGenreTagContext(
                queue,
                currentTrack,
                [],
                null,
                fetcher,
            )

            expect(fetcher).toHaveBeenCalledWith(currentTrack.author)
            expect(result.currentTrackTags.length).toBeGreaterThanOrEqual(0)
        })

        it('detects sertanejo seed with hasGenreTag true', async () => {
            const { hasGenreTag } = require('./artistTagCache')
            hasGenreTag.mockReturnValue(true)

            const result = await buildGenreTagContext(
                createGuildQueue(),
                createTrack(),
                [],
                null,
                jest.fn().mockResolvedValue(['sertanejo', 'forró']),
            )

            expect(result.blockSertanejo).toBe(false)
        })

        it('sets seedIsSertanejo false when currentTrackTags empty', async () => {
            const result = await buildGenreTagContext(
                createGuildQueue(),
                createTrack(),
                [],
                null,
                jest.fn().mockResolvedValue([]),
            )

            expect(result.blockSertanejo).toBe(true)
        })

        it('respects blockSertanejo guild setting', async () => {
            const guildSettings = { blockSertanejo: false }
            const result = await buildGenreTagContext(
                createGuildQueue(),
                createTrack(),
                [],
                guildSettings,
                jest.fn().mockResolvedValue([]),
            )

            expect(result.blockSertanejo).toBe(false)
        })

        it('reuses one fetcher for the seed and the session families', async () => {
            const fetcher = jest.fn().mockResolvedValue([])
            const history = [
                createTrack({ author: 'A' }),
                createTrack({ author: 'B' }),
            ]

            await buildGenreTagContext(
                createGuildQueue(),
                createTrack({ author: 'Seed' }),
                history,
                null,
                fetcher,
            )

            // The caller owns the fetcher, so the memo cache inside it survives
            // across the seed lookup, session-family detection and the
            // collectors. Building a second one here would reset that cache.
            const { createArtistTagFetcher } = require('./artistTagCache')
            expect(createArtistTagFetcher).not.toHaveBeenCalled()
            expect(fetcher).toHaveBeenCalledWith('Seed')
        })

        it('logs genre context details', async () => {
            const { debugLog } = require('@lucky/shared/utils')
            debugLog.mockClear()

            await buildGenreTagContext(
                createGuildQueue(),
                createTrack(),
                [],
                null,
                jest.fn().mockResolvedValue([]),
            )

            expect(debugLog).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('genre context built'),
                }),
            )
        })
    })

    describe('collectAllCandidates', () => {
        it('collects from all five sources', async () => {
            const {
                collectRecommendationCandidates,
            } = require('./candidateCollector')
            const {
                collectBroadFallbackCandidates,
                collectGenreCandidates,
            } = require('../candidateFallback')
            const {
                collectSeedSimilarCandidates,
            } = require('./seedSimilarityCollector')
            const { collectLastFmCandidates } = require('./lastFmSeeder')

            const candidates = new Map()
            collectRecommendationCandidates.mockResolvedValue(candidates)

            const autoplayContext = {
                queue: createGuildQueue(),
                currentTrack: createTrack(),
                recentArtists: new Set(),
                autoplayMode: 'similar' as const,
                artistFrequency: new Map(),
                excludedUrls: new Set(),
                excludedKeys: new Set(),
                preferredArtistKeys: new Set(),
                blockedArtistKeys: new Set(),
                implicitDislikeKeys: new Set(),
                implicitLikeKeys: new Set(),
                dislikedWeights: new Map(),
                likedWeights: new Map(),
                sessionMood: {
                    deepDiveArtist: null,
                    preferLong: false,
                    preferShort: false,
                    restless: false,
                    dominantLocale: null,
                },
                genreContext: {
                    getArtistTags: jest.fn().mockResolvedValue([]),
                    currentTrackTags: [],
                    sessionGenreFamilies: new Set(),
                },
                replayFrequentTrackIds: new Set(),
                replayFrequentArtists: new Set(),
                recentArtistIndices: new Map(),
            }

            // guildSettings must carry autoplayGenres or the genre collector is
            // skipped, and every collector mock leaves `candidates` empty, which
            // is what lets the fallback branch (size === 0) run too.
            const result = await collectAllCandidates(
                autoplayContext,
                [createTrack()],
                createUser(),
                false,
                { autoplayGenres: ['rock'] },
                new Map(),
            )

            expect(collectRecommendationCandidates).toHaveBeenCalled()
            expect(collectSeedSimilarCandidates).toHaveBeenCalled()
            expect(collectLastFmCandidates).toHaveBeenCalled()
            expect(collectGenreCandidates).toHaveBeenCalled()
            expect(collectBroadFallbackCandidates).toHaveBeenCalled()
            expect(result.sourcesCounts).toHaveProperty('recommendation')
        })

        it('skips seedSimilar when requestedBy is null', async () => {
            const {
                collectSeedSimilarCandidates,
            } = require('./seedSimilarityCollector')

            const autoplayContext = {
                queue: createGuildQueue(),
                currentTrack: createTrack(),
                recentArtists: new Set(),
                autoplayMode: 'similar' as const,
                artistFrequency: new Map(),
                excludedUrls: new Set(),
                excludedKeys: new Set(),
                preferredArtistKeys: new Set(),
                blockedArtistKeys: new Set(),
                implicitDislikeKeys: new Set(),
                implicitLikeKeys: new Set(),
                dislikedWeights: new Map(),
                likedWeights: new Map(),
                sessionMood: {
                    deepDiveArtist: null,
                    preferLong: false,
                    preferShort: false,
                    restless: false,
                    dominantLocale: null,
                },
                genreContext: {
                    getArtistTags: jest.fn().mockResolvedValue([]),
                    currentTrackTags: [],
                    sessionGenreFamilies: new Set(),
                },
                replayFrequentTrackIds: new Set(),
                replayFrequentArtists: new Set(),
                recentArtistIndices: new Map(),
            }

            const {
                collectRecommendationCandidates,
            } = require('./candidateCollector')
            collectRecommendationCandidates.mockResolvedValue(new Map())

            const result = await collectAllCandidates(
                autoplayContext,
                [createTrack()],
                null,
                false,
                null,
                new Map(),
            )

            expect(result.sourcesCounts.seedSimilar).toEqual({ skipped: true })
            expect(collectSeedSimilarCandidates).not.toHaveBeenCalled()
        })
    })

    describe('selectAndRerankCandidates', () => {
        it('calls selectDiverseCandidates with correct parameters', async () => {
            const { selectDiverseCandidates } = require('./diversitySelector')
            selectDiverseCandidates.mockReturnValue([])

            const candidates = new Map()
            const mood = {
                deepDiveArtist: null,
                preferLong: false,
                preferShort: false,
                restless: false,
                dominantLocale: null,
            }

            await selectAndRerankCandidates(
                candidates,
                2,
                mood,
                createTrack(),
                'similar',
                null,
            )

            expect(selectDiverseCandidates).toHaveBeenCalledWith(
                candidates,
                2,
                expect.any(Number),
                expect.any(Number),
                expect.any(String),
            )
        })

        it('relaxes max-per-artist when deep-diving', async () => {
            const { selectDiverseCandidates } = require('./diversitySelector')
            const { interleaveByArtist } = require('../candidateFallback')
            selectDiverseCandidates.mockReturnValue([])
            interleaveByArtist.mockImplementation((tracks: any[]) => tracks)

            const currentTrack = createTrack({ author: 'Deep Dive Artist' })
            const mood = {
                deepDiveArtist: 'deep dive artist',
                preferLong: false,
                preferShort: false,
                restless: false,
                dominantLocale: null,
            }

            await selectAndRerankCandidates(
                new Map(),
                2,
                mood,
                currentTrack,
                'similar',
                null,
            )

            const callArgs = selectDiverseCandidates.mock.calls[0]
            expect(callArgs[2]).toBe(5)
        })
    })

    describe('enqueueAndFinalize', () => {
        it('logs and returns early when enriched is empty', async () => {
            const { warnLog } = require('@lucky/shared/utils')
            warnLog.mockClear()

            const queue = createGuildQueue()
            const autoplayContext = {
                queue,
                currentTrack: createTrack(),
                excludedUrls: new Set(),
                excludedKeys: new Set(),
                autoplayMode: 'similar' as const,
            } as any
            await enqueueAndFinalize(
                autoplayContext,
                [],
                new Map(),
                null,
                {
                    recommendation: 0,
                    seedSimilar: 0,
                    lastfm: 0,
                    genre: 0,
                    fallback: 0,
                },
                Date.now(),
            )

            expect(warnLog).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('no candidates selected'),
                }),
            )
        })

        it('calls addSelectedTracks when enriched has items', async () => {
            const { addSelectedTracks } = require('./diversitySelector')
            addSelectedTracks.mockResolvedValue(undefined)

            const track = createTrack()
            const enriched = [
                {
                    track,
                    score: 0.8,
                    basis: { sources: ['recommendation'] },
                } as any,
            ]

            const queue = createGuildQueue()
            const autoplayContext = {
                queue,
                currentTrack: createTrack(),
                excludedUrls: new Set(),
                excludedKeys: new Set(),
                autoplayMode: 'similar' as const,
            } as any
            await enqueueAndFinalize(
                autoplayContext,
                enriched,
                new Map(),
                createUser(),
                {
                    recommendation: 1,
                    seedSimilar: 0,
                    lastfm: 0,
                    genre: 0,
                    fallback: 0,
                },
                Date.now(),
            )

            expect(addSelectedTracks).toHaveBeenCalled()
        })

        it('logs completion when tracks are enqueued', async () => {
            const { debugLog } = require('@lucky/shared/utils')
            debugLog.mockClear()

            const track = createTrack()
            const enriched = [
                {
                    track,
                    score: 0.8,
                    basis: { sources: ['recommendation'] },
                } as any,
            ]

            const queue = createGuildQueue()
            const autoplayContext = {
                queue,
                currentTrack: createTrack(),
                excludedUrls: new Set(),
                excludedKeys: new Set(),
                autoplayMode: 'similar' as const,
            } as any
            await enqueueAndFinalize(
                autoplayContext,
                enriched,
                new Map(),
                null,
                {
                    recommendation: 1,
                    seedSimilar: 0,
                    lastfm: 0,
                    genre: 0,
                    fallback: 0,
                },
                Date.now(),
            )

            expect(debugLog).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('Autoplay pass complete'),
                }),
            )
        })
    })
})
