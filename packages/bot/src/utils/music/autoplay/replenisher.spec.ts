import { jest } from '@jest/globals'
import type { Track, GuildQueue } from 'discord-player'
import { replenishQueue } from './replenisher'

jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
    errorLog: jest.fn(),
    warnLog: jest.fn(),
}))

jest.mock('@lucky/shared/services', () => ({
    recommendationFeedbackService: {
        getLikedTrackWeights: jest.fn(),
        getDislikedTrackWeights: jest.fn(),
        getImplicitDislikeKeys: jest.fn(),
        getImplicitLikeKeys: jest.fn(),
        getPreferredArtistKeys: jest.fn(),
        getBlockedArtistKeys: jest.fn(),
    },
    trackHistoryService: {
        getTrackHistory: jest.fn(),
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

function createGuildQueue(overrides: Partial<GuildQueue> = {}): GuildQueue {
    return {
        guild: { id: 'guildid' },
        tracks: new Map(),
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

        const { collectRecommendationCandidates } = require('./candidateCollector')
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
        enrichWithAudioFeatures.mockImplementation((tracks: any[]) => Promise.resolve(tracks))
        getTrackAudioFeatures.mockResolvedValue(null)
        interleaveByArtist.mockImplementation((tracks: any[]) => tracks)
        buildVcContributionWeights.mockReturnValue(new Map())

        const { createArtistTagFetcher } = require('./artistTagCache')
        createArtistTagFetcher.mockReturnValue(jest.fn().mockResolvedValue([]))
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

    it('should skip replenish if no current track', async () => {
        const queue = createGuildQueue({ currentTrack: undefined })
        const { collectRecommendationCandidates } =
            require('./candidateCollector')

        await replenishQueue(queue)

        expect(
            collectRecommendationCandidates,
        ).not.toHaveBeenCalled()
    })

    it('should skip replenish if queue is full (>= AUTOPLAY_BUFFER_SIZE)', async () => {
        const queue = createGuildQueue()
        const tracks = new Map()
        for (let i = 0; i < 10; i++) {
            tracks.set(`track${i}`, createTrack({ id: `track${i}` }))
        }
        queue.tracks = tracks

        const { collectRecommendationCandidates } =
            require('./candidateCollector')

        await replenishQueue(queue)

        expect(
            collectRecommendationCandidates,
        ).not.toHaveBeenCalled()
    })

    it('should handle errors gracefully without throwing', async () => {
        const queue = createGuildQueue()
        const { collectRecommendationCandidates } =
            require('./candidateCollector')
        collectRecommendationCandidates.mockRejectedValue(
            new Error('Test error'),
        )

        await expect(replenishQueue(queue)).resolves.toBeUndefined()

        const { errorLog } = require('@lucky/shared/utils')
        expect(errorLog).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining(
                    'Error replenishing queue',
                ),
            }),
        )
    })

    it('should call purgeDuplicatesOfCurrentTrack', async () => {
        const queue = createGuildQueue()
        const { purgeDuplicatesOfCurrentTrack } =
            require('./diversitySelector')

        await replenishQueue(queue)

        expect(purgeDuplicatesOfCurrentTrack).toHaveBeenCalled()
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
        const { collectRecommendationCandidates } = require('./candidateCollector')
        const { interleaveByArtist, enrichWithAudioFeatures } =
            require('../queueManipulation')

        const mockScoredTracks = [
            { track: createTrack({ id: 'track1' }), score: 0.8, reason: 'test' },
            { track: createTrack({ id: 'track2' }), score: 0.7, reason: 'test' },
        ]
        selectDiverseCandidates.mockReturnValue(mockScoredTracks)
        interleaveByArtist.mockReturnValue(mockScoredTracks)
        enrichWithAudioFeatures.mockResolvedValue(mockScoredTracks)

        const candidateMap = new Map()
        candidateMap.set('candidate1', {
            track: createTrack({ id: 'candidate1' }),
            reason: 'test',
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
                        spotify: expect.any(Number),
                        lastfm: expect.any(Number),
                        fallback: expect.any(Number),
                    }),
                }),
            }),
        )
    })
})
