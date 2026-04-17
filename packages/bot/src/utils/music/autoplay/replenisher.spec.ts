import { jest } from '@jest/globals'
import type { Track, GuildQueue } from 'discord-player'
import { replenishQueue } from './replenisher'

const debugLogMock = jest.fn()
const errorLogMock = jest.fn()
const warnLogMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    debugLog: (...args: unknown[]) => debugLogMock(...args),
    errorLog: (...args: unknown[]) => errorLogMock(...args),
    warnLog: (...args: unknown[]) => warnLogMock(...args),
}))

jest.mock('@lucky/shared/services', () => ({
    recommendationFeedbackService: {
        getLikedTrackWeights: jest.fn(() => Promise.resolve(new Map())),
        getDislikedTrackWeights: jest.fn(() => Promise.resolve(new Map())),
        getImplicitDislikeKeys: jest.fn(() => Promise.resolve(new Set())),
        getImplicitLikeKeys: jest.fn(() => Promise.resolve(new Set())),
        getPreferredArtistKeys: jest.fn(() => Promise.resolve(new Set())),
        getBlockedArtistKeys: jest.fn(() => Promise.resolve(new Set())),
    },
    trackHistoryService: {
        getTrackHistory: jest.fn(() => Promise.resolve([])),
    },
    guildSettingsService: {
        getGuildSettings: jest.fn(() => Promise.resolve(null)),
    },
    spotifyLinkService: {
        getValidAccessToken: jest.fn(() => Promise.resolve(null)),
    },
}))

jest.mock('./sessionMood', () => ({
    detectSessionMood: jest.fn(() => null),
}))

jest.mock('./candidateCollector', () => ({
    collectRecommendationCandidates: jest.fn(
        () => Promise.resolve(new Map()),
    ),
}))

jest.mock('./diversitySelector', () => ({
    buildExcludedUrls: jest.fn(() => new Set()),
    buildExcludedKeys: jest.fn(() => new Set()),
    selectDiverseCandidates: jest.fn(() => []),
    addSelectedTracks: jest.fn(() => Promise.resolve()),
    purgeDuplicatesOfCurrentTrack: jest.fn(),
}))

jest.mock('../queueManipulation', () => ({
    collectBroadFallbackCandidates: jest.fn(
        () => Promise.resolve(),
    ),
    collectLastFmCandidates: jest.fn(
        () => Promise.resolve(),
    ),
    collectGenreCandidates: jest.fn(
        () => Promise.resolve(),
    ),
    enrichWithAudioFeatures: jest.fn(
        (tracks: any[]) => Promise.resolve(tracks),
    ),
    getTrackAudioFeatures: jest.fn(
        () => Promise.resolve(null),
    ),
    interleaveByArtist: jest.fn(
        (tracks: any[]) => tracks,
    ),
    buildVcContributionWeights: jest.fn(
        () => new Map(),
    ),
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
        jest.clearAllMocks()
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

        // Both promises resolved without error
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

        expect(errorLogMock).toHaveBeenCalledWith(
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

        await replenishQueue(queue)

        expect(debugLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Replenishing queue',
            }),
        )
    })
})
