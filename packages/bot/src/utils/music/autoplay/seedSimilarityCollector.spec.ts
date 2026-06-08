import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import type { Track, GuildQueue } from 'discord-player'
import type { AutoplayContext } from './autoplayContext'

const getSimilarTracksMock = jest.fn()
const createArtistTagFetcherMock = jest.fn()
const cleanSearchQueryMock = jest.fn()
const cleanTitleMock = jest.fn()
const calculateRecommendationScoreMock = jest.fn()
const normalizeTrackKeyMock = jest.fn()
const shouldIncludeCandidateMock = jest.fn()
const upsertScoredCandidateMock = jest.fn()
const searchLastFmQueryMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
}))

jest.mock('../../../lastfm', () => ({
    getSimilarTracks: (...args: unknown[]) => getSimilarTracksMock(...args),
}))

jest.mock('./artistTagCache', () => ({
    createArtistTagFetcher: (...args: unknown[]) =>
        createArtistTagFetcherMock(...args),
}))

jest.mock('../searchQueryCleaner', () => ({
    cleanSearchQuery: (...args: unknown[]) => cleanSearchQueryMock(...args),
    cleanTitle: (...args: unknown[]) => cleanTitleMock(...args),
}))

jest.mock('./candidateScorer', () => ({
    calculateRecommendationScore: (...args: unknown[]) =>
        calculateRecommendationScoreMock(...args),
}))

jest.mock('./scoringUtils', () => ({
    normalizeTrackKey: (...args: unknown[]) => normalizeTrackKeyMock(...args),
}))

jest.mock('./candidateCollector', () => ({
    shouldIncludeCandidate: (...args: unknown[]) =>
        shouldIncludeCandidateMock(...args),
    upsertScoredCandidate: (...args: unknown[]) =>
        upsertScoredCandidateMock(...args),
}))

jest.mock('./lastFmSeeder', () => ({
    searchLastFmQuery: (...args: unknown[]) => searchLastFmQueryMock(...args),
}))

import { collectSeedSimilarCandidates } from './seedSimilarityCollector'

function createTrack(
    title = 'Track',
    author = 'Artist',
    url = 'https://spotify.com/t',
): Track {
    return {
        title,
        author,
        url,
        durationMS: 200_000,
        requestedBy: null,
    } as unknown as Track
}

function createUser(id = 'user-1') {
    return { id } as never
}

function createAutoplayContext(
    overrides: Partial<AutoplayContext> = {},
): AutoplayContext {
    return {
        queue: { guild: { id: 'guild-1' } } as unknown as GuildQueue,
        excludedUrls: new Set(),
        excludedKeys: new Set(),
        dislikedWeights: new Map(),
        likedWeights: new Map(),
        preferredArtistKeys: new Set(),
        blockedArtistKeys: new Set(),
        currentTrack: createTrack(),
        recentArtists: new Set(),
        autoplayMode: 'similar',
        artistFrequency: new Map(),
        implicitDislikeKeys: new Set(),
        implicitLikeKeys: new Set(),
        sessionMood: null,
        genreContext: {},
        ...overrides,
    }
}

describe('collectSeedSimilarCandidates', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        cleanSearchQueryMock.mockImplementation(
            (t: unknown, a: unknown) => `${t} ${a}`,
        )
        cleanTitleMock.mockImplementation((s: unknown) => s)
        normalizeTrackKeyMock.mockReturnValue('normalized-key')
        shouldIncludeCandidateMock.mockReturnValue(true)
        calculateRecommendationScoreMock.mockReturnValue({
            score: 0.5,
            signals: [],
        })
        createArtistTagFetcherMock.mockReturnValue(
            jest.fn().mockResolvedValue([]),
        )
        searchLastFmQueryMock.mockResolvedValue([])
    })

    it('returns early without similars and adds nothing', async () => {
        getSimilarTracksMock.mockResolvedValue([])
        const ctx = createAutoplayContext({
            currentTrack: createTrack('Empty', 'NoSimilars'),
        })
        const candidates = new Map()
        await collectSeedSimilarCandidates(ctx, createUser(), candidates)
        expect(searchLastFmQueryMock).not.toHaveBeenCalled()
        expect(upsertScoredCandidateMock).not.toHaveBeenCalled()
    })

    it('returns early when the seed track has no artist', async () => {
        const ctx = createAutoplayContext({
            currentTrack: createTrack('Title', ''),
        })
        const candidates = new Map()
        await collectSeedSimilarCandidates(ctx, createUser(), candidates)
        expect(getSimilarTracksMock).not.toHaveBeenCalled()
    })

    it('grounds on the CURRENT track (not a user seed slice) via track.getSimilar', async () => {
        getSimilarTracksMock.mockResolvedValue([
            { title: 'Sim', artist: 'SimA', match: 1 },
        ])
        searchLastFmQueryMock.mockResolvedValue([createTrack('Sim', 'SimA')])
        const ctx = createAutoplayContext({
            currentTrack: createTrack('Purple Rain', 'Prince'),
        })
        const candidates = new Map()
        await collectSeedSimilarCandidates(ctx, createUser(), candidates)

        expect(getSimilarTracksMock).toHaveBeenCalledWith(
            'Prince',
            'Purple Rain',
            expect.any(Number),
        )
        const call = upsertScoredCandidateMock.mock.calls[0]
        expect((call?.[2] as { source: string })?.source).toBe('seed-similar')
    })

    it('weights a perfect match (1.0) at full strength', async () => {
        getSimilarTracksMock.mockResolvedValue([
            { title: 'Sim', artist: 'SimA', match: 1 },
        ])
        searchLastFmQueryMock.mockResolvedValue([createTrack('Sim', 'SimA')])
        const ctx = createAutoplayContext({
            currentTrack: createTrack('FullMatch', 'ArtistFM'),
        })
        const candidates = new Map()
        await collectSeedSimilarCandidates(ctx, createUser(), candidates)
        const score = (
            upsertScoredCandidateMock.mock.calls[0]?.[2] as { score: number }
        )?.score
        // (rec 0.5 + SEED_SIMILAR_BOOST 0.25) * (0.5 + 0.5*1) = 0.75
        expect(score).toBeCloseTo(0.75, 5)
    })

    it('keeps a weak match (0.0) competitive at the 0.5x floor', async () => {
        getSimilarTracksMock.mockResolvedValue([
            { title: 'Sim', artist: 'SimA', match: 0 },
        ])
        searchLastFmQueryMock.mockResolvedValue([createTrack('Sim', 'SimA')])
        const ctx = createAutoplayContext({
            currentTrack: createTrack('WeakMatch', 'ArtistWM'),
        })
        const candidates = new Map()
        await collectSeedSimilarCandidates(ctx, createUser(), candidates)
        const score = (
            upsertScoredCandidateMock.mock.calls[0]?.[2] as { score: number }
        )?.score
        // (0.5 + 0.25) * (0.5 + 0.5*0) = 0.375 — never crushed to ~0
        expect(score).toBeCloseTo(0.375, 5)
    })

    it('skips disliked candidates (weight > 0.5)', async () => {
        getSimilarTracksMock.mockResolvedValue([
            { title: 'Sim', artist: 'SimA', match: 0.9 },
        ])
        searchLastFmQueryMock.mockResolvedValue([createTrack('Sim', 'SimA')])
        const ctx = createAutoplayContext({
            currentTrack: createTrack('Disliked', 'ArtistD'),
            dislikedWeights: new Map([['normalized-key', 0.9]]),
        })
        const candidates = new Map()
        await collectSeedSimilarCandidates(ctx, createUser(), candidates)
        expect(upsertScoredCandidateMock).not.toHaveBeenCalled()
    })

    it('does not throw when the similar fetch rejects (never stalls)', async () => {
        getSimilarTracksMock.mockRejectedValue(new Error('last.fm down'))
        const ctx = createAutoplayContext({
            currentTrack: createTrack('Rejects', 'ArtistR'),
        })
        const candidates = new Map()
        await expect(
            collectSeedSimilarCandidates(ctx, createUser(), candidates),
        ).resolves.toBeUndefined()
        expect(upsertScoredCandidateMock).not.toHaveBeenCalled()
    })
})
