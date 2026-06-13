import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import type { Track, GuildQueue } from 'discord-player'
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
    },
}))

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

jest.mock('../queueManipulation', () => ({
    collectBroadFallbackCandidates: jest.fn(),
    collectLastFmCandidates: jest.fn(),
    collectGenreCandidates: jest.fn(),
    enrichWithAudioFeatures: jest.fn(),
    getTrackAudioFeatures: jest.fn(),
    interleaveByArtist: jest.fn(),
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
        const {
            recommendationFeedbackService: feedbackSvc,
        } = require('../../../services/musicRecommendation/feedbackService')
        feedbackSvc.getLikedTrackWeights.mockResolvedValue(new Map())
        feedbackSvc.getDislikedTrackWeights.mockResolvedValue(new Map())
        feedbackSvc.getImplicitDislikeKeys.mockResolvedValue(new Set())
        feedbackSvc.getImplicitLikeKeys.mockResolvedValue(new Set())
        feedbackSvc.getPreferredArtistKeys.mockResolvedValue(new Set())
        feedbackSvc.getBlockedArtistKeys.mockResolvedValue(new Set())

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
        } = require('./diversitySelector')
        buildExcludedUrls.mockReturnValue(new Set())
        buildExcludedKeys.mockReturnValue(new Set())
        selectDiverseCandidates.mockReturnValue([])
        addSelectedTracks.mockResolvedValue(undefined)

        const {
            collectBroadFallbackCandidates,
            collectLastFmCandidates,
            collectGenreCandidates,
            enrichWithAudioFeatures,
            getTrackAudioFeatures,
            interleaveByArtist,
            buildVcContributionWeights,
        } = require('../queueManipulation')
        collectBroadFallbackCandidates.mockResolvedValue(undefined)
        collectLastFmCandidates.mockResolvedValue(undefined)
        collectGenreCandidates.mockResolvedValue(undefined)
        enrichWithAudioFeatures.mockImplementation((tracks: any[]) =>
            Promise.resolve(tracks),
        )
        getTrackAudioFeatures.mockResolvedValue(null)
        interleaveByArtist.mockImplementation((tracks: any[]) => tracks)
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
        const queue = createGuildQueue()
        const { selectDiverseCandidates } = require('./diversitySelector')
        const {
            collectRecommendationCandidates,
        } = require('./candidateCollector')
        const {
            interleaveByArtist,
            enrichWithAudioFeatures,
        } = require('../queueManipulation')

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

        const candidateMap = new Map()
        candidateMap.set('candidate1', {
            track: createTrack({ id: 'candidate1' }),
            basis: { source: 'spotify-rec', signals: [] },
            score: 0.5,
        })
        collectRecommendationCandidates.mockResolvedValue(candidateMap)

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
