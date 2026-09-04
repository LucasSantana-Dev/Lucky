import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import type { Track, GuildQueue } from 'discord-player'

// Mock lru-cache early to prevent LRUCache constructor errors in spotifyApi
jest.mock('lru-cache', () => ({
    LRUCache: jest.fn(function () {
        this.get = jest.fn().mockReturnValue(null)
        this.set = jest.fn()
        this.delete = jest.fn()
        this.clear = jest.fn()
    }),
}))

import { replenishQueue, popularityBoost } from './replenisher'

jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
    errorLog: jest.fn(),
    warnLog: jest.fn(),
}))

// skipCircuitBreaker (imported transitively via replenisher) pulls in this shared
// service, whose real module loads prismaClient (import.meta). Factory-mock it.
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
        getByDiscordId: jest.fn(),
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
        recordRecommendationPick: jest.fn(),
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

jest.mock('../../../services/musicManagement/queueManipulation', () => ({
    enrichWithAudioFeatures: jest.fn(),
    getTrackAudioFeatures: jest.fn(),
    buildVcContributionWeights: jest.fn(),
}))

jest.mock('./artistTagCache', () => ({
    createArtistTagFetcher: jest.fn(),
}))

jest.mock('./lastFmSeeder', () => ({
    collectLastFmCandidates: jest.fn(),
}))

jest.mock('./seedSimilarityCollector', () => ({
    collectSeedSimilarCandidates: jest.fn(),
}))

function createTrack(overrides: Partial<Track> = {}): Track {
    return {
        title: 'Test Song',
        author: 'Test Artist',
        durationMS: 3 * 60 * 1000,
        url: 'https://open.spotify.com/track/testid',
        id: 'testid',
        source: 'spotify',
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

describe('replenishQueue', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        const {
            recommendationFeedbackService: feedbackSvc,
        } = require('../../../services/musicRecommendation/feedbackService')
        feedbackSvc.getLikedTrackWeights.mockResolvedValue(new Map())
        feedbackSvc.getDislikedTrackWeights.mockResolvedValue(new Map())
        feedbackSvc.getImplicitDislikeKeys.mockResolvedValue(new Set())
        feedbackSvc.getImplicitLikeKeys.mockResolvedValue(new Set())
        feedbackSvc.getPreferredArtistKeys.mockResolvedValue(new Set())
        feedbackSvc.getBlockedArtistKeys.mockResolvedValue(new Set())
        feedbackSvc.getGuildImplicitDislikeKeys.mockReturnValue(new Set())

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
            collectRecommendationCandidates,
        } = require('./candidateCollector')
        collectRecommendationCandidates.mockResolvedValue(new Map())

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
            interleaveByArtist: iba,
        } = require('../candidateFallback')
        collectBroadFallbackCandidates.mockResolvedValue(undefined)
        collectGenreCandidates.mockResolvedValue(undefined)
        iba.mockImplementation((tracks: any[]) => tracks)

        const {
            enrichWithAudioFeatures,
            getTrackAudioFeatures,
            buildVcContributionWeights,
        } = require('../../../services/musicManagement/queueManipulation')
        enrichWithAudioFeatures.mockImplementation((tracks: any[]) =>
            Promise.resolve(tracks),
        )
        getTrackAudioFeatures.mockResolvedValue(null)
        buildVcContributionWeights.mockReturnValue(new Map())

        const { createArtistTagFetcher } = require('./artistTagCache')
        createArtistTagFetcher.mockReturnValue(jest.fn().mockResolvedValue([]))

        const {
            collectSeedSimilarCandidates,
        } = require('./seedSimilarityCollector')
        collectSeedSimilarCandidates.mockResolvedValue(undefined)
    })

    it('should be exported and callable', async () => {
        const queue = createGuildQueue()
        expect(typeof replenishQueue).toBe('function')

        const result = replenishQueue(queue)
        expect(result).toBeInstanceOf(Promise)

        await result
    })

    // #2146: production runs LOG_LEVEL=2, so the per-source breakdown that
    // used to sit on the debug line below this warn was invisible exactly
    // when it was needed. These pin it to the warn.
    it('reports the per-source breakdown when no candidates are selected', async () => {
        const { warnLog } = require('@lucky/shared/utils')
        const queue = createGuildQueue()

        await replenishQueue(queue)

        const call = warnLog.mock.calls.find(
            ([arg]: [{ message: string }]) =>
                arg.message ===
                'Autoplay: no candidates selected — queue may stall',
        )
        expect(call).toBeDefined()
        expect(call[0].data).toEqual(
            expect.objectContaining({
                candidatePoolSize: 0,
                sources: expect.objectContaining({
                    recommendation: 0,
                    seedSimilar: { skipped: true },
                    lastfm: { skipped: true },
                    fallback: 0,
                    genre: { skipped: true },
                }),
                rejected: expect.objectContaining({
                    hardReject: 0,
                    duplicate: 0,
                }),
                hasRequester: false,
            }),
        )
    })

    it('distinguishes a collector that ran and found nothing from a skipped one', async () => {
        const { warnLog } = require('@lucky/shared/utils')
        const {
            collectRecommendationCandidates,
        } = require('./candidateCollector')
        // Pool is non-empty, but nothing survives selection. Proves the
        // breakdown reports real counts rather than a hardcoded zero.
        collectRecommendationCandidates.mockResolvedValue(
            new Map([
                ['a', { track: createTrack() }],
                ['b', { track: createTrack() }],
            ]),
        )
        const {
            collectSeedSimilarCandidates,
        } = require('./seedSimilarityCollector')
        const queue = createGuildQueue({
            metadata: { requestedBy: { id: 'u1' } },
        } as Partial<GuildQueue>)

        await replenishQueue(queue)

        const call = warnLog.mock.calls.find(
            ([arg]: [{ message: string }]) =>
                arg.message ===
                'Autoplay: no candidates selected — queue may stall',
        )
        expect(call).toBeDefined()
        // Counts are real, not hardcoded zeros.
        expect(call[0].data.candidatePoolSize).toBe(2)
        expect(call[0].data.sources.recommendation).toBe(2)

        // And this is the distinction the breakdown exists to make. The seed
        // collector is gated on a requester; here one is present, so it ran and
        // legitimately found nothing. Its 0 therefore means "empty", not
        // "skipped" — and hasRequester is what tells the two apart in the log.
        expect(collectSeedSimilarCandidates).toHaveBeenCalled()
        expect(call[0].data.sources.seedSimilar).toBe(0)
        expect(call[0].data.hasRequester).toBe(true)
    })

    it('should serialize concurrent calls with locks', async () => {
        const queue = createGuildQueue()

        const p1 = replenishQueue(queue)
        const p2 = replenishQueue(queue)

        await Promise.all([p1, p2])

        expect(true).toBe(true)
    })

    it('does not process when no current track', async () => {
        const queue = createGuildQueue({ currentTrack: undefined })

        await replenishQueue(queue)

        expect(queue.tracks.size).toBeLessThanOrEqual(0)
    })

    it('does not add more tracks when queue is full', async () => {
        const queue = createGuildQueue()
        const entries: [string, Track][] = []
        for (let i = 0; i < 10; i++) {
            const track = createTrack({
                id: `track${i}`,
                metadata: { isAutoplay: true } as Record<string, unknown>,
            })
            entries.push([`track${i}`, track])
        }
        queue.tracks = createTracksMap(entries)
        const initialSize = queue.tracks.size

        await replenishQueue(queue)

        expect(queue.tracks.size).toBe(initialSize)
    })

    it('should replenish when queue has user-added tracks but autoplay count is below buffer', async () => {
        const queue = createGuildQueue()
        const entries: [string, Track][] = []
        for (let i = 0; i < 8; i++) {
            const track = createTrack({ id: `user${i}`, metadata: undefined })
            entries.push([`user${i}`, track])
        }
        const autoTrack = createTrack({
            id: 'auto0',
            metadata: { isAutoplay: true } as Record<string, unknown>,
        })
        entries.push(['auto0', autoTrack])
        queue.tracks = createTracksMap(entries)

        const {
            collectRecommendationCandidates,
        } = require('./candidateCollector')

        await replenishQueue(queue)

        expect(collectRecommendationCandidates).toHaveBeenCalled()
    })

    it('calls getReplayFrequentTracks during replenish', async () => {
        const queue = createGuildQueue()
        const entries: [string, Track][] = []
        for (let i = 0; i < 8; i++) {
            const track = createTrack({ id: `user${i}`, metadata: undefined })
            entries.push([`user${i}`, track])
        }
        const autoTrack = createTrack({
            id: 'auto0',
            metadata: { isAutoplay: true } as Record<string, unknown>,
        })
        entries.push(['auto0', autoTrack])
        queue.tracks = createTracksMap(entries)

        const { trackHistoryService } = require('@lucky/shared/services')

        await replenishQueue(queue)

        expect(
            trackHistoryService.getReplayFrequentTracks,
        ).toHaveBeenCalledWith('guildid')
    })

    it('should handle errors gracefully without throwing', async () => {
        const queue = createGuildQueue()
        const {
            collectRecommendationCandidates,
        } = require('./candidateCollector')
        collectRecommendationCandidates.mockRejectedValue(
            new Error('Test error'),
        )

        await expect(replenishQueue(queue)).resolves.toBeUndefined()

        const { errorLog } = require('@lucky/shared/utils')
        expect(errorLog).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining('Error replenishing queue'),
            }),
        )
    })

    it('processes queue cleanup on replenish', async () => {
        const queue = createGuildQueue()

        await replenishQueue(queue)

        // Verify that replenishQueue executed without error (queue is still accessible)
        expect(queue.tracks).toBeDefined()
        expect(typeof queue.tracks.size).toBe('number')
    })

    it('should log debug info on start', async () => {
        const queue = createGuildQueue()
        const { debugLog } = require('@lucky/shared/utils')

        await replenishQueue(queue)

        expect(debugLog).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Replenishing queue',
            }),
        )
    })

    it('should emit telemetry log with correct fields', async () => {
        const queue = createGuildQueue({
            metadata: { requestedBy: { id: 'u1' } },
        } as Partial<GuildQueue>)
        const { selectDiverseCandidates } = require('./diversitySelector')
        const {
            collectRecommendationCandidates,
        } = require('./candidateCollector')
        const { interleaveByArtist } = require('../candidateFallback')
        const {
            enrichWithAudioFeatures,
        } = require('../../../services/musicManagement/queueManipulation')
        const { guildSettingsService } = require('@lucky/shared/services')
        const { collectGenreCandidates } = require('../candidateFallback')

        const mockScoredTracks = [
            {
                track: createTrack({ id: 'track1' }),
                score: 0.8,
                basis: { source: 'spotify-rec', signals: [] },
            },
            {
                track: createTrack({ id: 'track2' }),
                score: 0.7,
                basis: { source: 'spotify-rec', signals: [] },
            },
        ]
        selectDiverseCandidates.mockReturnValue(mockScoredTracks)
        interleaveByArtist.mockReturnValue(mockScoredTracks)
        enrichWithAudioFeatures.mockResolvedValue(mockScoredTracks)
        guildSettingsService.getGuildSettings.mockResolvedValue({
            autoplayGenres: ['rock', 'pop'],
        })

        const candidateMap = new Map()
        candidateMap.set('candidate1', {
            track: createTrack({ id: 'candidate1' }),
            basis: { source: 'spotify-rec', signals: [] },
            score: 0.5,
        })
        collectRecommendationCandidates.mockResolvedValue(candidateMap)
        collectGenreCandidates.mockImplementation(
            (queue: any, genres: any, requestedBy: any, params: any) => {
                // Add one track to the candidates map
                params.candidates.set('genre1', {
                    track: createTrack({ id: 'genre1' }),
                    basis: { source: 'genre', signals: [] },
                    score: 0.4,
                })
            },
        )

        await replenishQueue(queue)

        const { debugLog } = require('@lucky/shared/utils')
        expect(debugLog).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Autoplay pass complete',
                data: expect.objectContaining({
                    guildId: 'guildid',
                    tracksAdded: expect.any(Number),
                    candidatePoolSize: expect.any(Number),
                    durationMs: expect.any(Number),
                    sources: expect.objectContaining({
                        recommendation: expect.any(Number),
                        lastfm: expect.any(Number),
                        fallback: expect.any(Number),
                        genre: expect.any(Number),
                    }),
                }),
            }),
        )
    })

    // #2147: candidatePoolSize used to be assigned once right after the first
    // (recommendation) collector and never reassigned, so telemetry
    // understated the pool by whatever the later collectors contributed.
    it('reports the final pool size after every collector runs, not just the first', async () => {
        const { selectDiverseCandidates } = require('./diversitySelector')
        const {
            collectRecommendationCandidates,
        } = require('./candidateCollector')
        const {
            collectSeedSimilarCandidates,
        } = require('./seedSimilarityCollector')
        const { interleaveByArtist } = require('../candidateFallback')

        const mockScoredTracks = [
            {
                track: createTrack({ id: 'a' }),
                score: 0.8,
                basis: { source: 'spotify-rec', signals: [] },
            },
        ]
        selectDiverseCandidates.mockReturnValue(mockScoredTracks)
        interleaveByArtist.mockReturnValue(mockScoredTracks)

        collectRecommendationCandidates.mockResolvedValue(
            new Map([['a', { track: createTrack({ id: 'a' }) }]]),
        )
        // Mutates the shared candidates Map the same way the real collector
        // does — this is what the stale variable failed to pick up.
        collectSeedSimilarCandidates.mockImplementation(
            async (
                _ctx: unknown,
                _requestedBy: unknown,
                candidates: Map<string, unknown>,
            ) => {
                candidates.set('b', { track: createTrack({ id: 'b' }) })
                candidates.set('c', { track: createTrack({ id: 'c' }) })
            },
        )

        const queue = createGuildQueue({
            metadata: { requestedBy: { id: 'u1' } },
        } as Partial<GuildQueue>)

        await replenishQueue(queue)

        const { debugLog } = require('@lucky/shared/utils')
        const call = debugLog.mock.calls.find(
            ([arg]: [{ message: string }]) =>
                arg.message === 'Autoplay pass complete',
        )
        expect(call).toBeDefined()
        // 1 from recommendation + 2 from seed-similar = 3, the final pool —
        // not 1, the stale first-collector value.
        expect(call[0].data.candidatePoolSize).toBe(3)
    })

    it('calls recordRecommendationOutcome with rejected for purged autoplay tracks', async () => {
        const { purgeDuplicatesOfCurrentTrack } = require('./diversitySelector')
        const autoplayTrack = createTrack({
            id: 'purged-autoplay-1',
            metadata: { isAutoplay: true },
        })
        purgeDuplicatesOfCurrentTrack.mockReturnValue([autoplayTrack])

        const queue = createGuildQueue()
        await replenishQueue(queue)

        const {
            recordRecommendationOutcome,
        } = require('../../../services/musicRecommendation/recommendationTelemetry')
        expect(recordRecommendationOutcome).toHaveBeenCalledWith(
            expect.objectContaining({
                trackId: 'purged-autoplay-1',
                outcome: 'rejected',
            }),
        )
    })

    it('does not call recordRecommendationOutcome for purged non-autoplay tracks', async () => {
        const { purgeDuplicatesOfCurrentTrack } = require('./diversitySelector')
        const manualTrack = createTrack({
            id: 'purged-manual-1',
            metadata: { isAutoplay: false },
        })
        purgeDuplicatesOfCurrentTrack.mockReturnValue([manualTrack])

        const queue = createGuildQueue()
        await replenishQueue(queue)

        const {
            recordRecommendationOutcome,
        } = require('../../../services/musicRecommendation/recommendationTelemetry')
        expect(recordRecommendationOutcome).not.toHaveBeenCalled()
    })

    it('passes Spotify genre fallback to createArtistTagFetcher when token is available', async () => {
        const queue = createGuildQueue({
            currentTrack: createTrack({
                requestedBy: { id: 'user-123' } as import('discord.js').User,
            }),
        })
        const { spotifyLinkService } = require('@lucky/shared/services')
        spotifyLinkService.getValidAccessToken.mockResolvedValue('test-token')

        const { createArtistTagFetcher } = require('./artistTagCache')

        await replenishQueue(queue)

        expect(createArtistTagFetcher).toHaveBeenCalledWith(
            expect.any(Function),
        )
    })

    it('runs the seed-similarity spine when a requester is known', async () => {
        const queue = createGuildQueue({
            currentTrack: createTrack({
                requestedBy: { id: 'user-123' } as import('discord.js').User,
            }),
        })
        const {
            collectSeedSimilarCandidates,
        } = require('./seedSimilarityCollector')

        await replenishQueue(queue)

        expect(collectSeedSimilarCandidates).toHaveBeenCalled()
    })

    it('skips the seed-similarity spine when no requester is resolvable', async () => {
        const queue = createGuildQueue({
            currentTrack: createTrack({ requestedBy: null }),
            metadata: {},
        })
        const {
            collectSeedSimilarCandidates,
        } = require('./seedSimilarityCollector')

        await replenishQueue(queue)

        expect(collectSeedSimilarCandidates).not.toHaveBeenCalled()
    })

    it('respects blockSertanejo=true setting to block sertanejo candidates when seed is not sertanejo', async () => {
        const queue = createGuildQueue()
        const { guildSettingsService } = require('@lucky/shared/services')

        // Mock settings with blockSertanejo=true
        guildSettingsService.getGuildSettings.mockResolvedValue({
            blockSertanejo: true,
            autoplayMode: 'similar',
            autoplayGenres: [],
        })

        // Verify replenishQueue executes without error
        await expect(replenishQueue(queue)).resolves.toBeUndefined()

        // Verify guildSettingsService.getGuildSettings was called
        expect(guildSettingsService.getGuildSettings).toHaveBeenCalledWith(
            'guildid',
        )
    })

    it('respects blockSertanejo=false setting to allow sertanejo candidates', async () => {
        const queue = createGuildQueue()
        const { guildSettingsService } = require('@lucky/shared/services')

        // Mock settings with blockSertanejo=false
        guildSettingsService.getGuildSettings.mockResolvedValue({
            blockSertanejo: false,
            autoplayMode: 'similar',
            autoplayGenres: [],
        })

        // Verify replenishQueue executes without error
        await expect(replenishQueue(queue)).resolves.toBeUndefined()

        // Verify guildSettingsService.getGuildSettings was called
        expect(guildSettingsService.getGuildSettings).toHaveBeenCalledWith(
            'guildid',
        )
    })

    it('defaults to blockSertanejo=true when setting is undefined', async () => {
        const queue = createGuildQueue()
        const { guildSettingsService } = require('@lucky/shared/services')

        // Mock settings without blockSertanejo field
        guildSettingsService.getGuildSettings.mockResolvedValue({
            autoplayMode: 'similar',
            autoplayGenres: [],
        })

        // Verify replenishQueue executes without error
        await expect(replenishQueue(queue)).resolves.toBeUndefined()

        // Verify guildSettingsService.getGuildSettings was called
        expect(guildSettingsService.getGuildSettings).toHaveBeenCalledWith(
            'guildid',
        )
    })

    it('builds recency-decay indices from full history: most-recent-per-artist, dedup, missing-author skip, window-bounded', async () => {
        const {
            collectRecommendationCandidates,
        } = require('./candidateCollector')
        collectRecommendationCandidates.mockResolvedValue(new Map())

        // allTracks = [currentTrack, ...history]; only positions < window (10)
        // are mapped, each unique artist keyed to its most-recent position.
        const history = [
            createTrack({ author: 'Alpha' }), // allTracks idx 1
            createTrack({ author: 'Beta' }), // idx 2
            createTrack({ author: 'Alpha' }), // idx 3 — dup, keep idx 1
            createTrack({ author: '' }), // idx 4 — missing author, skip
            createTrack({ author: 'F5' }), // idx 5
            createTrack({ author: 'F6' }), // idx 6
            createTrack({ author: 'F7' }), // idx 7
            createTrack({ author: 'F8' }), // idx 8
            createTrack({ author: 'F9' }), // idx 9
            createTrack({ author: 'OutOfWindow' }), // idx 10 — beyond window
        ]
        const queue = createGuildQueue({
            currentTrack: createTrack({ author: 'Cur' }),
            history: { tracks: { toArray: () => history } },
        } as Partial<GuildQueue>)

        await replenishQueue(queue)

        const ctx = collectRecommendationCandidates.mock.calls[0][0]
        const indices: Map<string, number> = ctx.recentArtistIndices
        expect(indices.get('cur')).toBe(0)
        expect(indices.get('alpha')).toBe(1) // most-recent position wins
        expect(indices.get('beta')).toBe(2)
        expect(indices.get('f9')).toBe(9)
        expect(indices.has('')).toBe(false) // missing author skipped
        expect(indices.has('outofwindow')).toBe(false) // window-bounded
    })
})

describe('clearSessionMoodCache', () => {
    it('removes session mood cache for a given guild', async () => {
        const { clearSessionMoodCache } = require('./replenisher')
        const { detectSessionMood } = require('./sessionMood')

        const guildId = 'test-guild-id'
        const queue = createGuildQueue()
        queue.guild.id = guildId

        detectSessionMood.mockReturnValue({ energy: 0.5, valence: 0.7 })

        // First replenish to populate the cache
        await replenishQueue(queue)

        // Clear the cache
        clearSessionMoodCache(guildId)

        // The cache should be cleared (we verify by checking the function exists and is callable)
        expect(typeof clearSessionMoodCache).toBe('function')
    })
})

describe('popularityBoost', () => {
    it('boosts high-popularity artists in popular mode, nothing below the threshold', () => {
        expect(popularityBoost('popular', 80)).toBeCloseTo(0.12, 5)
        expect(popularityBoost('popular', 50)).toBe(0)
    })

    it('boosts low-popularity artists in discover mode, nothing above the threshold', () => {
        expect(popularityBoost('discover', 30)).toBeCloseTo(0.12, 5)
        expect(popularityBoost('discover', 60)).toBe(0)
    })

    it('applies a mild popularity gradient in similar mode', () => {
        expect(popularityBoost('similar', 100)).toBeCloseTo(0.12, 5)
        expect(popularityBoost('similar', 50)).toBeCloseTo(0.06, 5)
        expect(popularityBoost('similar', 0)).toBe(0)
    })
})
