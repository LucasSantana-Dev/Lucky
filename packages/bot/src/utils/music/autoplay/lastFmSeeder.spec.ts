import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import type { Track, GuildQueue } from 'discord-player'

const lastFmLinkServiceMock = { getByDiscordId: jest.fn() }
const consumeLastFmSeedSliceMock = jest.fn()
const consumeBlendedSeedSliceMock = jest.fn()
const isLovedSeedMock = jest.fn()
const getSimilarTracksMock = jest.fn()
const getTagTopTracksMock = jest.fn()
const createArtistTagFetcherMock = jest.fn()
const cleanSearchQueryMock = jest.fn()
const cleanTitleMock = jest.fn()
const calculateRecommendationScoreMock = jest.fn()
const shouldIncludeCandidateMock = jest.fn()
const upsertScoredCandidateMock = jest.fn()
const normalizeTrackKeyMock = jest.fn()

jest.mock('discord-player', () => ({
    QueryType: { SPOTIFY_SEARCH: 'spotify_search', YOUTUBE_SEARCH: 'youtube_search', AUTO: 'auto' },
}))

jest.mock('@lucky/shared/services', () => ({
    lastFmLinkService: {
        getByDiscordId: (...args: unknown[]) => lastFmLinkServiceMock.getByDiscordId(...args),
    },
}))

jest.mock('./lastFmSeeds', () => ({
    consumeLastFmSeedSlice: (...args: unknown[]) => consumeLastFmSeedSliceMock(...args),
    consumeBlendedSeedSlice: (...args: unknown[]) => consumeBlendedSeedSliceMock(...args),
    isLovedSeed: (...args: unknown[]) => isLovedSeedMock(...args),
}))

jest.mock('../../../lastfm', () => ({
    getSimilarTracks: (...args: unknown[]) => getSimilarTracksMock(...args),
    getTagTopTracks: (...args: unknown[]) => getTagTopTracksMock(...args),
}))

jest.mock('./artistTagCache', () => ({
    createArtistTagFetcher: (...args: unknown[]) => createArtistTagFetcherMock(...args),
}))

jest.mock('../searchQueryCleaner', () => ({
    cleanSearchQuery: (...args: unknown[]) => cleanSearchQueryMock(...args),
    cleanTitle: (...args: unknown[]) => cleanTitleMock(...args),
}))

jest.mock('./candidateScorer', () => ({
    calculateRecommendationScore: (...args: unknown[]) => calculateRecommendationScoreMock(...args),
}))

jest.mock('../queueManipulation', () => ({
    shouldIncludeCandidate: (...args: unknown[]) => shouldIncludeCandidateMock(...args),
    upsertScoredCandidate: (...args: unknown[]) => upsertScoredCandidateMock(...args),
    normalizeTrackKey: (...args: unknown[]) => normalizeTrackKeyMock(...args),
}))

import { searchLastFmQuery, collectLastFmCandidates } from './lastFmSeeder'

function createTrack(title = 'Track', author = 'Artist', url = 'https://spotify.com/t'): Track {
    return { title, author, url, durationMS: 200_000, requestedBy: null } as unknown as Track
}

function createQueue(searchResult: { tracks: Track[] } = { tracks: [] }): GuildQueue {
    return {
        player: {
            search: jest.fn().mockResolvedValue(searchResult),
        },
        metadata: { vcMemberIds: [] },
        guild: { id: 'guild-1' },
    } as unknown as GuildQueue
}

function createUser(id = 'user-1') {
    return { id } as never
}

describe('searchLastFmQuery', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('returns tracks from first successful search engine', async () => {
        const track = createTrack()
        const queue = createQueue({ tracks: [track] })
        const user = createUser()
        const result = await searchLastFmQuery(queue, 'test query', user)
        expect(result).toHaveLength(1)
        expect(result[0]).toBe(track)
    })

    it('falls through to next engine when first throws', async () => {
        const track = createTrack()
        const queue = createQueue({ tracks: [] })
        const searchMock = queue.player.search as jest.Mock
        searchMock
            .mockRejectedValueOnce(new Error('spotify error'))
            .mockResolvedValueOnce({ tracks: [track] })
        const user = createUser()
        const result = await searchLastFmQuery(queue, 'test query', user)
        expect(result).toHaveLength(1)
        expect(searchMock).toHaveBeenCalledTimes(2)
    })

    it('returns empty array when all engines fail', async () => {
        const queue = createQueue({ tracks: [] })
        const searchMock = queue.player.search as jest.Mock
        searchMock.mockRejectedValue(new Error('network error'))
        const user = createUser()
        const result = await searchLastFmQuery(queue, 'test query', user)
        expect(result).toEqual([])
    })

    it('filters out tracks exceeding max duration', async () => {
        const longTrack = createTrack()
        ;(longTrack as unknown as { durationMS: number }).durationMS = 15 * 60 * 1000
        const goodTrack = createTrack('Short Song')
        const queue = createQueue({ tracks: [longTrack, goodTrack] })
        const user = createUser()
        const result = await searchLastFmQuery(queue, 'query', user)
        expect(result).not.toContain(longTrack)
        expect(result).toContain(goodTrack)
    })

    it('returns empty array when search returns no tracks', async () => {
        const queue = createQueue({ tracks: [] })
        const user = createUser()
        const result = await searchLastFmQuery(queue, 'empty query', user)
        expect(result).toEqual([])
    })

    it('limits results to SEARCH_RESULTS_LIMIT (8)', async () => {
        const tracks = Array.from({ length: 12 }, (_, i) => createTrack(`T${i}`, 'A'))
        const queue = createQueue({ tracks })
        const user = createUser()
        const result = await searchLastFmQuery(queue, 'query', user)
        expect(result.length).toBeLessThanOrEqual(8)
    })
})

describe('collectLastFmCandidates', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        cleanSearchQueryMock.mockImplementation((t: unknown, a: unknown) => `${t} ${a}`)
        cleanTitleMock.mockImplementation((s: unknown) => s)
        normalizeTrackKeyMock.mockReturnValue('normalized-key')
        shouldIncludeCandidateMock.mockReturnValue(true)
        calculateRecommendationScoreMock.mockReturnValue({ score: 0.5, reason: 'test' })
        isLovedSeedMock.mockReturnValue(false)
        getSimilarTracksMock.mockResolvedValue([])
        getTagTopTracksMock.mockResolvedValue([])
        createArtistTagFetcherMock.mockReturnValue(jest.fn().mockResolvedValue([]))
    })

    it('returns early when seedSlice is empty (no linked users)', async () => {
        consumeLastFmSeedSliceMock.mockResolvedValue([])
        const queue = createQueue()
        const user = createUser()
        const candidates = new Map()

        await collectLastFmCandidates(
            queue, user,
            new Set(), new Set(), new Map(), new Map(),
            new Set(), new Set(), createTrack(), new Set(), candidates,
        )

        expect(upsertScoredCandidateMock).not.toHaveBeenCalled()
    })

    it('uses single-user seed slice when no VC members', async () => {
        consumeLastFmSeedSliceMock.mockResolvedValue([{ title: 'T1', artist: 'A1' }])
        const queue = createQueue({ tracks: [createTrack()] })
        const user = createUser()
        const candidates = new Map()

        await collectLastFmCandidates(
            queue, user,
            new Set(), new Set(), new Map(), new Map(),
            new Set(), new Set(), createTrack(), new Set(), candidates,
        )

        expect(consumeLastFmSeedSliceMock).toHaveBeenCalledWith('user-1', 3)
    })

    it('uses blended seed when multiple VC members are linked', async () => {
        lastFmLinkServiceMock.getByDiscordId
            .mockResolvedValue({ lastFmUsername: 'user' })
        consumeBlendedSeedSliceMock.mockResolvedValue([{ title: 'T1', artist: 'A1' }])
        const queue = {
            player: { search: jest.fn().mockResolvedValue({ tracks: [createTrack()] }) },
            metadata: { vcMemberIds: ['user-1', 'user-2'] },
            guild: { id: 'guild-1' },
        } as unknown as GuildQueue
        const user = createUser()
        const candidates = new Map()

        await collectLastFmCandidates(
            queue, user,
            new Set(), new Set(), new Map(), new Map(),
            new Set(), new Set(), createTrack(), new Set(), candidates,
        )

        expect(consumeBlendedSeedSliceMock).toHaveBeenCalled()
    })

    it('skips disliked tracks (weight > 0.5)', async () => {
        consumeLastFmSeedSliceMock.mockResolvedValue([{ title: 'T1', artist: 'A1' }])
        const track = createTrack()
        const queue = createQueue({ tracks: [track] })
        const user = createUser()
        const dislikedWeights = new Map([['normalized-key', 0.9]])
        const candidates = new Map()

        await collectLastFmCandidates(
            queue, user,
            new Set(), new Set(), dislikedWeights, new Map(),
            new Set(), new Set(), createTrack(), new Set(), candidates,
        )

        expect(upsertScoredCandidateMock).not.toHaveBeenCalled()
    })

    it('applies loved seed extra boost when seed is loved', async () => {
        consumeLastFmSeedSliceMock.mockResolvedValue([{ title: 'T1', artist: 'A1' }])
        isLovedSeedMock.mockReturnValue(true)
        const track = createTrack()
        const queue = createQueue({ tracks: [track] })
        const user = createUser()
        const candidates = new Map()

        await collectLastFmCandidates(
            queue, user,
            new Set(), new Set(), new Map(), new Map(),
            new Set(), new Set(), createTrack(), new Set(), candidates,
        )

        const call = upsertScoredCandidateMock.mock.calls[0]
        const scoreArg = (call?.[2] as { score: number })?.score
        // Base: rec.score (0.5) + LASTFM_SCORE_BOOST (0.20) + LOVED_SEED_EXTRA_BOOST (0.10) = 0.80
        expect(scoreArg).toBeCloseTo(0.8, 5)
    })

    it('skips excluded tracks (shouldIncludeCandidate returns false)', async () => {
        consumeLastFmSeedSliceMock.mockResolvedValue([{ title: 'T1', artist: 'A1' }])
        shouldIncludeCandidateMock.mockReturnValue(false)
        const queue = createQueue({ tracks: [createTrack()] })
        const user = createUser()
        const candidates = new Map()

        await collectLastFmCandidates(
            queue, user,
            new Set(), new Set(), new Map(), new Map(),
            new Set(), new Set(), createTrack(), new Set(), candidates,
        )

        expect(upsertScoredCandidateMock).not.toHaveBeenCalled()
    })

    it('processes similar tracks from getSimilarTracks', async () => {
        consumeLastFmSeedSliceMock.mockResolvedValue([{ title: 'T1', artist: 'A1' }])
        getSimilarTracksMock.mockResolvedValue([{ title: 'Similar', artist: 'SimilarArtist', match: 80 }])
        const track = createTrack()
        const queue = createQueue({ tracks: [track] })
        const user = createUser()
        const candidates = new Map()

        await collectLastFmCandidates(
            queue, user,
            new Set(), new Set(), new Map(), new Map(),
            new Set(), new Set(), createTrack(), new Set(), candidates,
        )

        // seed track + similar track both call upsertScoredCandidate
        expect(upsertScoredCandidateMock).toHaveBeenCalledTimes(2)
        const similarCall = upsertScoredCandidateMock.mock.calls[1]
        const reason = (similarCall?.[2] as { reason: string })?.reason
        expect(reason).toContain('similar to your taste')
    })

    it('skips excluded tracks in similar-tracks loop (line 155 continue)', async () => {
        consumeLastFmSeedSliceMock.mockResolvedValue([{ title: 'T1', artist: 'A1' }])
        getSimilarTracksMock.mockResolvedValue([{ title: 'Similar', artist: 'SimilarArtist', match: 80 }])
        // seed: include, similar: exclude
        shouldIncludeCandidateMock
            .mockReturnValueOnce(true)
            .mockReturnValueOnce(false)
        const track = createTrack()
        const queue = createQueue({ tracks: [track] })
        const user = createUser()
        const candidates = new Map()

        await collectLastFmCandidates(
            queue, user,
            new Set(), new Set(), new Map(), new Map(),
            new Set(), new Set(), createTrack(), new Set(), candidates,
        )

        expect(upsertScoredCandidateMock).toHaveBeenCalledTimes(1)
    })

    it('skips disliked tracks in similar-tracks loop (line 162 continue)', async () => {
        consumeLastFmSeedSliceMock.mockResolvedValue([{ title: 'T1', artist: 'A1' }])
        getSimilarTracksMock.mockResolvedValue([{ title: 'Similar', artist: 'SimilarArtist', match: 80 }])
        normalizeTrackKeyMock
            .mockReturnValueOnce('seed-key')
            .mockReturnValueOnce('similar-key')
        const dislikedWeights = new Map([['similar-key', 0.9]])
        const track = createTrack()
        const queue = createQueue({ tracks: [track] })
        const user = createUser()
        const candidates = new Map()

        await collectLastFmCandidates(
            queue, user,
            new Set(), new Set(), dislikedWeights, new Map(),
            new Set(), new Set(), createTrack(), new Set(), candidates,
        )

        expect(upsertScoredCandidateMock).toHaveBeenCalledTimes(1)
    })

    it('uses sparse-artist fallback when candidates < 3 and dominant tag exists', async () => {
        consumeLastFmSeedSliceMock.mockResolvedValue([{ title: 'T1', artist: 'A1' }])
        getSimilarTracksMock.mockResolvedValue([])
        createArtistTagFetcherMock.mockReturnValue(jest.fn().mockResolvedValue(['rock']))
        getTagTopTracksMock.mockResolvedValue([{ title: 'TagTrack', artist: 'TagArtist' }])
        const track = createTrack()
        const queue = createQueue({ tracks: [track] })
        const user = createUser()
        const candidates = new Map()

        await collectLastFmCandidates(
            queue, user,
            new Set(), new Set(), new Map(), new Map(),
            new Set(), new Set(), createTrack(), new Set(), candidates,
        )

        expect(getTagTopTracksMock).toHaveBeenCalledWith('rock', 20)
        const calls = upsertScoredCandidateMock.mock.calls
        const genreCall = calls.find(
            (c) => ((c[2] as { reason: string })?.reason ?? '').includes('genre fallback'),
        )
        expect(genreCall).toBeDefined()
    })

    it('skips disliked tracks in sparse-artist fallback', async () => {
        consumeLastFmSeedSliceMock.mockResolvedValue([{ title: 'T1', artist: 'A1' }])
        getSimilarTracksMock.mockResolvedValue([])
        createArtistTagFetcherMock.mockReturnValue(jest.fn().mockResolvedValue(['jazz']))
        getTagTopTracksMock.mockResolvedValue([{ title: 'TagTrack', artist: 'TagArtist' }])
        // seed key: 'seed-key', genre-fallback key: 'genre-key' (disliked)
        normalizeTrackKeyMock
            .mockReturnValueOnce('seed-key')
            .mockReturnValueOnce('genre-key')
        const dislikedWeights = new Map([['genre-key', 0.9]])
        const queue = createQueue({ tracks: [createTrack()] })
        const user = createUser()
        const candidates = new Map()

        await collectLastFmCandidates(
            queue, user,
            new Set(), new Set(), dislikedWeights, new Map(),
            new Set(), new Set(), createTrack(), new Set(), candidates,
        )

        const calls = upsertScoredCandidateMock.mock.calls
        const genreCall = calls.find(
            (c) => ((c[2] as { reason: string })?.reason ?? '').includes('genre fallback'),
        )
        expect(genreCall).toBeUndefined()
    })
})
