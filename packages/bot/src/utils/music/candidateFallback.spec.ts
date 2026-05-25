import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import type { ScoredTrack } from './autoplay/candidateCollector'
import type { AutoplayContext } from './autoplay/autoplayContext'

const getBatchAudioFeaturesMock = jest.fn()
const getArtistGenresMock = jest.fn()
const getValidAccessTokenMock = jest.fn()
const getTagTopTracksMock = jest.fn()
const searchLastFmQueryMock = jest.fn()
const shouldIncludeCandidateMock = jest.fn()
const upsertScoredCandidateMock = jest.fn()
const calculateRecommendationScoreMock = jest.fn()
const cleanSearchQueryMock = jest.fn()
const cleanAuthorMock = jest.fn()
const normalizeTrackKeyMock = jest.fn()
const calculateGenreFamilyPenaltyMock = jest.fn()
const artistTagFetcherMock = jest.fn()
const createArtistTagFetcherMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
    errorLog: jest.fn(),
    warnLog: jest.fn(),
}))

jest.mock('discord-player', () => ({
    QueryType: { SPOTIFY_SEARCH: 'spotify_search', AUTO: 'auto' },
}))

jest.mock('../../spotify/spotifyApi', () => ({
    getBatchAudioFeatures: (...args: unknown[]) =>
        getBatchAudioFeaturesMock(...args),
    getArtistGenres: (...args: unknown[]) => getArtistGenresMock(...args),
}))

jest.mock('@lucky/shared/services', () => ({
    spotifyLinkService: {
        getValidAccessToken: (...args: unknown[]) =>
            getValidAccessTokenMock(...args),
    },
}))

jest.mock('../../lastfm', () => ({
    getTagTopTracks: (...args: unknown[]) => getTagTopTracksMock(...args),
}))

jest.mock('./autoplay/lastFmSeeder', () => ({
    searchLastFmQuery: (...args: unknown[]) => searchLastFmQueryMock(...args),
}))

jest.mock('./autoplay/candidateCollector', () => ({
    shouldIncludeCandidate: (...args: unknown[]) =>
        shouldIncludeCandidateMock(...args),
    upsertScoredCandidate: (...args: unknown[]) =>
        upsertScoredCandidateMock(...args),
}))

jest.mock('./autoplay/candidateScorer', () => ({
    calculateRecommendationScore: (...args: unknown[]) =>
        calculateRecommendationScoreMock(...args),
}))

jest.mock('./searchQueryCleaner', () => ({
    cleanSearchQuery: (...args: unknown[]) => cleanSearchQueryMock(...args),
    cleanAuthor: (...args: unknown[]) => cleanAuthorMock(...args),
}))

jest.mock('./trackNormalization', () => ({
    normalizeTrackKey: (...args: unknown[]) => normalizeTrackKeyMock(...args),
    calculateGenreFamilyPenalty: (...args: unknown[]) =>
        calculateGenreFamilyPenaltyMock(...args),
}))

jest.mock('./autoplay/artistTagCache', () => ({
    createArtistTagFetcher: (...args: unknown[]) =>
        createArtistTagFetcherMock(...args),
}))

import {
    interleaveByArtist,
    enrichWithAudioFeatures,
    collectBroadFallbackCandidates,
    collectGenreCandidates,
} from './candidateFallback'

function createScoredTrack(
    author: string,
    score = 0.5,
    url = 'https://url',
): ScoredTrack {
    return {
        track: {
            title: 'Track',
            author,
            url,
            durationMS: 200_000,
        } as never,
        score,
        basis: { source: 'spotify-rec', signals: [] } as never,
    }
}

function createAutoplayContext(
    overrides: Partial<AutoplayContext> = {},
): AutoplayContext {
    return {
        queue: { player: { search: jest.fn() } } as never,
        excludedUrls: new Set(),
        excludedKeys: new Set(),
        dislikedWeights: new Map(),
        likedWeights: new Map(),
        preferredArtistKeys: new Set(),
        blockedArtistKeys: new Set(),
        currentTrack: {
            author: 'Artist',
            title: 'Song',
            url: 'u1',
            durationMS: 200_000,
        } as never,
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

describe('interleaveByArtist', () => {
    beforeEach(() => {
        cleanAuthorMock.mockImplementation((s: unknown) => s)
    })

    it('returns empty array for empty input and preserves single artist', () => {
        const result = interleaveByArtist([])
        expect(result).toEqual([])

        const singleArtistResult = interleaveByArtist([createScoredTrack('Artist A')])
        expect(singleArtistResult).toHaveLength(1)
    })

    it('interleaves tracks round-robin by artist', () => {
        const a1 = createScoredTrack('Artist A', 0.9, 'u1')
        const a2 = createScoredTrack('Artist A', 0.8, 'u2')
        const b1 = createScoredTrack('Artist B', 0.7, 'u3')
        const b2 = createScoredTrack('Artist B', 0.6, 'u4')
        const result = interleaveByArtist([a1, a2, b1, b2])
        expect(result).toHaveLength(4)
        const authors = result.map((t) => t.track.author)
        expect(new Set(authors.slice(0, 2)).size).toBe(2)
    })
})

describe('enrichWithAudioFeatures', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('returns tracks unchanged when conditions prevent enrichment', async () => {
        const tracks = [createScoredTrack('Artist A')]

        // null currentFeatures
        let result = await enrichWithAudioFeatures(tracks, 'user1', null)
        expect(result).toBe(tracks)

        // empty userId
        result = await enrichWithAudioFeatures(
            tracks,
            '',
            { energy: 0.7, valence: 0.5 } as never,
        )
        expect(result).toBe(tracks)

        // no spotify token
        getValidAccessTokenMock.mockResolvedValue(null)
        result = await enrichWithAudioFeatures(
            tracks,
            'user1',
            { energy: 0.7, valence: 0.5 } as never,
        )
        expect(result).toBe(tracks)
    })

    it('adjusts score based on energy and valence similarity', async () => {
        const spotifyUrl = 'https://open.spotify.com/track/abc123def456'
        const trackFeatures = new Map([
            ['abc123def456', { energy: 0.72, valence: 0.55 }],
        ])

        // Close match: boost
        getValidAccessTokenMock.mockResolvedValue('token123')
        getBatchAudioFeaturesMock.mockResolvedValue(trackFeatures)
        getArtistGenresMock.mockResolvedValue([])
        let track = createScoredTrack('Artist A', 0.5, spotifyUrl)
        let result = await enrichWithAudioFeatures(
            [track],
            'user1',
            { energy: 0.7, valence: 0.5 } as never,
        )
        expect(result[0].score).toBeGreaterThan(0.5)

        // Far apart: penalize
        jest.clearAllMocks()
        getValidAccessTokenMock.mockResolvedValue('token123')
        getBatchAudioFeaturesMock.mockResolvedValue(trackFeatures)
        getArtistGenresMock.mockResolvedValue([])
        track = createScoredTrack('Artist A', 0.5, spotifyUrl)
        result = await enrichWithAudioFeatures(
            [track],
            'user1',
            { energy: 0.1, valence: 0.1 } as never,
        )
        expect(result[0].score).toBeLessThan(0.5)
    })

    it('applies genre family penalty when artists differ', async () => {
        getValidAccessTokenMock.mockResolvedValue('token123')
        const spotifyUrl = 'https://open.spotify.com/track/abc123def456'
        const track = createScoredTrack('Hip Hop Artist', 0.5, spotifyUrl)
        const trackFeatures = new Map([
            ['abc123def456', { energy: 0.72, valence: 0.55 }],
        ])
        getBatchAudioFeaturesMock.mockResolvedValue(trackFeatures)
        getArtistGenresMock
            .mockResolvedValueOnce(['rock'])
            .mockResolvedValueOnce(['hip hop'])
        calculateGenreFamilyPenaltyMock.mockReturnValue(-0.6)

        const result = await enrichWithAudioFeatures(
            [track],
            'user1',
            { energy: 0.7, valence: 0.5 } as never,
            'Rock Artist',
        )
        expect(result[0].score).toBeLessThan(0.5)
        expect(result[0].basis.signals).toContain('genre family drift')
    })

    it('gracefully handles API errors during enrichment', async () => {
        getValidAccessTokenMock.mockResolvedValue('token123')
        const spotifyUrl = 'https://open.spotify.com/track/abc123def456'
        const track = createScoredTrack('Artist A', 0.5, spotifyUrl)

        // getBatchAudioFeatures error
        getBatchAudioFeaturesMock.mockRejectedValue(new Error('API error'))
        let result = await enrichWithAudioFeatures(
            [track],
            'user1',
            { energy: 0.7, valence: 0.5 } as never,
        )
        expect(result[0].score).toBe(0.5)

        // getValidAccessToken error
        jest.clearAllMocks()
        getValidAccessTokenMock.mockRejectedValue(new Error('auth failure'))
        result = await enrichWithAudioFeatures(
            [track],
            'user1',
            { energy: 0.7, valence: 0.5 } as never,
        )
        expect(result[0].score).toBe(0.5)
    })
})

describe('collectGenreCandidates', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        normalizeTrackKeyMock.mockReturnValue('key')
        shouldIncludeCandidateMock.mockReturnValue(true)
        calculateRecommendationScoreMock.mockReturnValue({
            score: 0.5,
            signals: [],
        })
        cleanSearchQueryMock.mockImplementation(
            (t: unknown, a: unknown) => `${t} ${a}`,
        )
    })

    function createCtx() {
        return {
            candidates: new Map(),
            recentArtists: new Set<string>(),
            likedTrackKeys: new Map<string, number>(),
            dislikedTrackKeys: new Map<string, number>(),
            currentTrack: {
                title: 'Now',
                author: 'Artist',
                url: 'u0',
                durationMS: 200_000,
            } as never,
            excludedUrls: new Set<string>(),
            excludedKeys: new Set<string>(),
            preferredArtistKeys: new Set<string>(),
            blockedArtistKeys: new Set<string>(),
            autoplayMode: 'similar' as const,
        }
    }

    it('does nothing when genres array is empty', async () => {
        const queue = { player: { search: jest.fn() } } as never
        const ctx = createCtx()
        await collectGenreCandidates(queue, [], { id: 'user-1' } as never, ctx)
        expect(getTagTopTracksMock).not.toHaveBeenCalled()
    })

    it('processes genres and respects buffer limits and inclusion filters', async () => {
        // Setup: empty buffer, normal inclusion
        getTagTopTracksMock.mockResolvedValue([
            { title: 'Seed', artist: 'Artist' },
        ])
        searchLastFmQueryMock.mockResolvedValue([
            {
                title: 'T1',
                author: 'A1',
                url: 'u1',
                durationMS: 180_000,
            },
        ])
        const queue = { player: { search: jest.fn() } } as never
        const ctx = createCtx()

        await collectGenreCandidates(
            queue,
            ['rock'],
            { id: 'user-1' } as never,
            ctx,
        )
        expect(upsertScoredCandidateMock).toHaveBeenCalled()

        // Buffer full: stops early
        jest.clearAllMocks()
        getTagTopTracksMock.mockResolvedValue([
            { title: 'Seed', artist: 'Artist' },
        ])
        searchLastFmQueryMock.mockResolvedValue([])
        const ctx2 = createCtx()
        for (let i = 0; i < 8; i++) {
            ctx2.candidates.set(`key-${i}`, {
                track: {} as never,
                score: 0.5,
                basis: { source: 'spotify-rec', signals: [] },
            })
        }
        await collectGenreCandidates(
            queue,
            ['rock', 'pop'],
            { id: 'user-1' } as never,
            ctx2,
        )
        expect(getTagTopTracksMock).not.toHaveBeenCalled()

        // Inclusion filter rejects candidate
        jest.clearAllMocks()
        getTagTopTracksMock.mockResolvedValue([
            { title: 'Seed', artist: 'Artist' },
        ])
        searchLastFmQueryMock.mockResolvedValue([
            {
                title: 'T1',
                author: 'A1',
                url: 'u1',
                durationMS: 180_000,
            },
        ])
        shouldIncludeCandidateMock.mockReturnValue(false)
        const ctx3 = createCtx()
        await collectGenreCandidates(
            queue,
            ['rock'],
            { id: 'user-1' } as never,
            ctx3,
        )
        expect(upsertScoredCandidateMock).not.toHaveBeenCalled()
    })
})

describe('collectBroadFallbackCandidates', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        normalizeTrackKeyMock.mockReturnValue('normalized-key')
        shouldIncludeCandidateMock.mockReturnValue(true)
        calculateRecommendationScoreMock.mockReturnValue({
            score: 0.5,
            signals: [],
        })
        artistTagFetcherMock.mockResolvedValue([])
        createArtistTagFetcherMock.mockReturnValue((...args: unknown[]) =>
            artistTagFetcherMock(...args),
        )
    })

    it('handles search errors and inclusion filters gracefully', async () => {
        // Search rejects: resolves without error
        const searchMock = jest
            .fn()
            .mockRejectedValue(new Error('network error'))
        let queue = { player: { search: searchMock } } as never
        let currentTrack = {
            author: 'Artist',
            title: 'Song',
            url: 'u1',
            durationMS: 200_000,
        } as never
        let candidates = new Map<string, ScoredTrack>()
        let ctx = createAutoplayContext({ queue, currentTrack })
        await expect(
            collectBroadFallbackCandidates(ctx, candidates),
        ).resolves.toBeUndefined()

        // Search succeeds but inclusion filter rejects
        jest.clearAllMocks()
        searchMock.mockResolvedValue({
            tracks: [
                { title: 'Found', author: 'Artist', url: 'u2', durationMS: 180_000 },
            ],
        })
        shouldIncludeCandidateMock.mockReturnValue(false)
        queue = { player: { search: searchMock } } as never
        candidates = new Map<string, ScoredTrack>()
        ctx = createAutoplayContext({ queue, currentTrack })
        await collectBroadFallbackCandidates(ctx, candidates)
        expect(upsertScoredCandidateMock).not.toHaveBeenCalled()
    })

    it('adds candidates from search and fetches artist tags', async () => {
        const foundTrack = {
            title: 'Hallelujah',
            author: 'Felipe Dutra',
            url: 'u2',
            durationMS: 180_000,
        }
        const searchMock = jest.fn().mockResolvedValue({ tracks: [foundTrack] })
        const queue = { player: { search: searchMock } } as never
        const currentTrack = {
            author: 'Coldplay',
            title: 'Yellow',
            url: 'u1',
            durationMS: 200_000,
        } as never
        const getArtistTagsMock = jest
            .fn()
            .mockResolvedValue(['latin gospel', 'latin christian'])
        const candidates = new Map<string, ScoredTrack>()

        const ctx = createAutoplayContext({
            queue,
            currentTrack,
            genreContext: { getArtistTags: getArtistTagsMock },
        })
        await collectBroadFallbackCandidates(ctx, candidates)

        expect(upsertScoredCandidateMock).toHaveBeenCalled()
        expect(getArtistTagsMock).toHaveBeenCalledWith('Felipe Dutra')
        expect(calculateRecommendationScoreMock).toHaveBeenCalledWith(
            expect.objectContaining({
                genreContext: expect.objectContaining({
                    candidateTags: ['latin gospel', 'latin christian'],
                }),
            }),
        )
    })

    it('falls back to empty tags when fetches fail or no tokens available', async () => {
        const foundTrack = {
            title: 'Song',
            author: 'Artist',
            url: 'u2',
            durationMS: 180_000,
        }

        // getArtistTags rejects
        const searchMock = jest.fn().mockResolvedValue({ tracks: [foundTrack] })
        let queue = { player: { search: searchMock } } as never
        let currentTrack = {
            author: 'Artist',
            title: 'Song',
            url: 'u1',
            durationMS: 200_000,
        } as never
        let getArtistTagsMock = jest
            .fn()
            .mockRejectedValue(new Error('lastfm down'))
        let candidates = new Map<string, ScoredTrack>()
        let ctx = createAutoplayContext({
            queue,
            currentTrack,
            genreContext: { getArtistTags: getArtistTagsMock },
        })
        await expect(
            collectBroadFallbackCandidates(ctx, candidates),
        ).resolves.toBeUndefined()
        expect(calculateRecommendationScoreMock).toHaveBeenCalledWith(
            expect.objectContaining({
                genreContext: expect.objectContaining({ candidateTags: [] }),
            }),
        )

        // No Spotify token but Last.fm available
        jest.clearAllMocks()
        searchMock.mockResolvedValue({ tracks: [foundTrack] })
        getArtistTagsMock = jest.fn().mockResolvedValue(['rock', 'indie'])
        getValidAccessTokenMock.mockResolvedValue(null)
        queue = { player: { search: searchMock } } as never
        candidates = new Map<string, ScoredTrack>()
        ctx = createAutoplayContext({
            queue,
            currentTrack,
            genreContext: { getArtistTags: getArtistTagsMock },
        })
        await collectBroadFallbackCandidates(ctx, candidates)
        expect(getArtistGenresMock).not.toHaveBeenCalled()
    })
})
