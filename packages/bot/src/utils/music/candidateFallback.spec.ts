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

    it('returns empty array for empty input', () => {
        const result = interleaveByArtist([])
        expect(result).toEqual([])
    })

    it('returns all tracks when single artist', () => {
        const tracks = [
            createScoredTrack('Artist A'),
            createScoredTrack('Artist A'),
            createScoredTrack('Artist A'),
        ]
        const result = interleaveByArtist(tracks)
        expect(result).toHaveLength(3)
    })

    it('interleaves tracks round-robin by artist', () => {
        const a1 = createScoredTrack('Artist A', 0.9, 'u1')
        const a2 = createScoredTrack('Artist A', 0.8, 'u2')
        const b1 = createScoredTrack('Artist B', 0.7, 'u3')
        const b2 = createScoredTrack('Artist B', 0.6, 'u4')
        const result = interleaveByArtist([a1, a2, b1, b2])
        expect(result).toHaveLength(4)
        // Each artist should appear alternately
        const authors = result.map((t) => t.track.author)
        expect(new Set(authors.slice(0, 2)).size).toBe(2)
    })

    it('handles single track', () => {
        const result = interleaveByArtist([createScoredTrack('Artist A')])
        expect(result).toHaveLength(1)
    })
})

describe('enrichWithAudioFeatures', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('returns tracks unchanged when currentFeatures is null', async () => {
        const tracks = [createScoredTrack('Artist A')]
        const result = await enrichWithAudioFeatures(tracks, 'user1', null)
        expect(result).toBe(tracks)
        expect(getBatchAudioFeaturesMock).not.toHaveBeenCalled()
    })

    it('returns tracks unchanged when userId is empty', async () => {
        const tracks = [createScoredTrack('Artist A')]
        const features = {
            energy: 0.7,
            valence: 0.5,
            danceability: 0.6,
            tempo: 120,
            acousticness: 0.1,
            instrumentalness: 0.0,
        }
        const result = await enrichWithAudioFeatures(
            tracks,
            '',
            features as never,
        )
        expect(result).toBe(tracks)
    })

    it('returns tracks unchanged when no spotify token available', async () => {
        getValidAccessTokenMock.mockResolvedValue(null)
        const tracks = [createScoredTrack('Artist A')]
        const features = { energy: 0.7, valence: 0.5 }
        const result = await enrichWithAudioFeatures(
            tracks,
            'user1',
            features as never,
        )
        expect(result).toBe(tracks)
    })

    it('returns tracks unchanged when no tracks have spotify URLs', async () => {
        getValidAccessTokenMock.mockResolvedValue('token123')
        const tracks = [
            createScoredTrack(
                'Artist A',
                0.5,
                'https://youtube.com/watch?v=abc',
            ),
        ]
        const features = { energy: 0.7, valence: 0.5 }
        const result = await enrichWithAudioFeatures(
            tracks,
            'user1',
            features as never,
        )
        expect(result).toBe(tracks)
    })

    it('boosts score when energy and valence are within close range', async () => {
        getValidAccessTokenMock.mockResolvedValue('token123')
        const spotifyUrl = 'https://open.spotify.com/track/abc123def456'
        const track = createScoredTrack('Artist A', 0.5, spotifyUrl)
        const currentFeatures = { energy: 0.7, valence: 0.5 }
        const trackFeatures = new Map([
            ['abc123def456', { energy: 0.72, valence: 0.55 }],
        ])
        getBatchAudioFeaturesMock.mockResolvedValue(trackFeatures)
        getArtistGenresMock.mockResolvedValue([])

        const result = await enrichWithAudioFeatures(
            [track],
            'user1',
            currentFeatures as never,
        )
        expect(result[0].score).toBeGreaterThan(0.5)
    })

    it('penalizes score when energy delta is very high and valence delta is also high', async () => {
        getValidAccessTokenMock.mockResolvedValue('token123')
        const spotifyUrl = 'https://open.spotify.com/track/abc123def456'
        const track = createScoredTrack('Artist A', 0.5, spotifyUrl)
        // energyDelta=0.8, valenceDelta=0.4 — second else-if branch misses (0.8>=0.3 AND 0.4>=0.35), third branch hits
        const currentFeatures = { energy: 0.1, valence: 0.1 }
        const trackFeatures = new Map([
            ['abc123def456', { energy: 0.9, valence: 0.5 }],
        ])
        getBatchAudioFeaturesMock.mockResolvedValue(trackFeatures)
        getArtistGenresMock.mockResolvedValue([])

        const result = await enrichWithAudioFeatures(
            [track],
            'user1',
            currentFeatures as never,
        )
        expect(result[0].score).toBeLessThan(0.5)
    })

    it('applies small boost when energy delta is medium range', async () => {
        getValidAccessTokenMock.mockResolvedValue('token123')
        const spotifyUrl = 'https://open.spotify.com/track/abc123def456'
        const track = createScoredTrack('Artist A', 0.5, spotifyUrl)
        // energyDelta=0.25 (< 0.3), valenceDelta=0.4 (>= 0.35) → second else-if triggers: score += 0.07
        const currentFeatures = { energy: 0.5, valence: 0.5 }
        const trackFeatures = new Map([
            ['abc123def456', { energy: 0.75, valence: 0.9 }],
        ])
        getBatchAudioFeaturesMock.mockResolvedValue(trackFeatures)
        getArtistGenresMock.mockResolvedValue([])

        const result = await enrichWithAudioFeatures(
            [track],
            'user1',
            currentFeatures as never,
        )
        expect(result[0].score).toBeCloseTo(0.57, 5)
    })

    it('applies genre family penalty when currentArtistName is provided and genres differ', async () => {
        getValidAccessTokenMock.mockResolvedValue('token123')
        const spotifyUrl = 'https://open.spotify.com/track/abc123def456'
        const track = createScoredTrack('Hip Hop Artist', 0.5, spotifyUrl)
        const currentFeatures = { energy: 0.7, valence: 0.5 }
        const trackFeatures = new Map([
            ['abc123def456', { energy: 0.72, valence: 0.55 }],
        ])
        getBatchAudioFeaturesMock.mockResolvedValue(trackFeatures)
        // First call: current artist genres; Second call: candidate artist genres
        getArtistGenresMock
            .mockResolvedValueOnce(['rock'])
            .mockResolvedValueOnce(['hip hop'])
        calculateGenreFamilyPenaltyMock.mockReturnValue(-0.6)

        const result = await enrichWithAudioFeatures(
            [track],
            'user1',
            currentFeatures as never,
            'Rock Artist',
        )
        expect(getArtistGenresMock).toHaveBeenCalledTimes(2)
        expect(calculateGenreFamilyPenaltyMock).toHaveBeenCalledWith(
            ['rock'],
            ['hip hop'],
        )
        expect(result[0].score).toBeLessThan(0.5)
        expect(result[0].basis.signals).toContain('genre family drift')
    })

    it('looks up candidate genres when currentArtistName genres are non-empty', async () => {
        getValidAccessTokenMock.mockResolvedValue('token123')
        const spotifyUrl = 'https://open.spotify.com/track/abc123def456'
        const track = createScoredTrack('Artist A', 0.5, spotifyUrl)
        const currentFeatures = { energy: 0.7, valence: 0.5 }
        const trackFeatures = new Map([
            ['abc123def456', { energy: 0.72, valence: 0.55 }],
        ])
        getBatchAudioFeaturesMock.mockResolvedValue(trackFeatures)
        getArtistGenresMock
            .mockResolvedValueOnce(['pop'])
            .mockResolvedValueOnce(['pop'])
        calculateGenreFamilyPenaltyMock.mockReturnValue(0)

        await enrichWithAudioFeatures(
            [track],
            'user1',
            currentFeatures as never,
            'Pop Artist',
        )
        expect(getArtistGenresMock).toHaveBeenCalledTimes(2)
    })

    it('returns tracks unchanged when getBatchAudioFeatures throws', async () => {
        getValidAccessTokenMock.mockResolvedValue('token123')
        const spotifyUrl = 'https://open.spotify.com/track/abc123def456'
        const track = createScoredTrack('Artist A', 0.5, spotifyUrl)
        const currentFeatures = { energy: 0.7, valence: 0.5 }
        getBatchAudioFeaturesMock.mockRejectedValue(
            new Error('Spotify API error'),
        )

        const result = await enrichWithAudioFeatures(
            [track],
            'user1',
            currentFeatures as never,
        )
        expect(result[0].score).toBe(0.5)
    })

    it('returns tracks unchanged when getValidAccessToken throws (catch callback)', async () => {
        getValidAccessTokenMock.mockRejectedValue(new Error('auth failure'))
        const spotifyUrl = 'https://open.spotify.com/track/abc123def456'
        const track = createScoredTrack('Artist A', 0.5, spotifyUrl)
        const currentFeatures = { energy: 0.7, valence: 0.5 }

        const result = await enrichWithAudioFeatures(
            [track],
            'user1',
            currentFeatures as never,
        )
        expect(result[0].score).toBe(0.5)
        expect(getBatchAudioFeaturesMock).not.toHaveBeenCalled()
    })

    it('falls back to empty array when getArtistGenres throws for currentArtistName', async () => {
        getValidAccessTokenMock.mockResolvedValue('token123')
        const spotifyUrl = 'https://open.spotify.com/track/abc123def456'
        const track = createScoredTrack('Artist A', 0.5, spotifyUrl)
        const currentFeatures = { energy: 0.72, valence: 0.55 }
        const trackFeatures = new Map([
            ['abc123def456', { energy: 0.72, valence: 0.55 }],
        ])
        getBatchAudioFeaturesMock.mockResolvedValue(trackFeatures)
        // First call (currentArtistName) throws — should fall back to []
        getArtistGenresMock.mockRejectedValueOnce(new Error('genres api down'))

        const result = await enrichWithAudioFeatures(
            [track],
            'user1',
            currentFeatures as never,
            'Rock Artist',
        )
        // currentGenres falls back to [] — no penalty applied, score unchanged
        expect(result[0].score).toBeCloseTo(0.65, 5)
    })

    it('falls back to empty array when getArtistGenres throws per track', async () => {
        getValidAccessTokenMock.mockResolvedValue('token123')
        const spotifyUrl = 'https://open.spotify.com/track/abc123def456'
        const track = createScoredTrack('Artist A', 0.5, spotifyUrl)
        const currentFeatures = { energy: 0.72, valence: 0.55 }
        const trackFeatures = new Map([
            ['abc123def456', { energy: 0.72, valence: 0.55 }],
        ])
        getBatchAudioFeaturesMock.mockResolvedValue(trackFeatures)
        // currentArtistName call succeeds, per-track call throws
        getArtistGenresMock
            .mockResolvedValueOnce(['rock'])
            .mockRejectedValueOnce(new Error('per-track genres failed'))
        calculateGenreFamilyPenaltyMock.mockReturnValue(0)

        const result = await enrichWithAudioFeatures(
            [track],
            'user1',
            currentFeatures as never,
            'Rock Artist',
        )
        expect(getArtistGenresMock).toHaveBeenCalledTimes(2)
        expect(result[0].score).toBeCloseTo(0.65, 5)
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

    it('calls getTagTopTracks and searchLastFmQuery for each genre', async () => {
        const foundTrack = {
            title: 'T1',
            author: 'A1',
            url: 'u1',
            durationMS: 180_000,
        }
        getTagTopTracksMock.mockResolvedValue([
            { title: 'Seed', artist: 'Artist' },
        ])
        searchLastFmQueryMock.mockResolvedValue([foundTrack])
        const queue = { player: { search: jest.fn() } } as never
        const ctx = createCtx()

        await collectGenreCandidates(
            queue,
            ['rock'],
            { id: 'user-1' } as never,
            ctx,
        )

        expect(getTagTopTracksMock).toHaveBeenCalledWith(
            'rock',
            expect.any(Number),
        )
        expect(searchLastFmQueryMock).toHaveBeenCalled()
        expect(upsertScoredCandidateMock).toHaveBeenCalled()
    })

    it('stops when candidates buffer is full', async () => {
        getTagTopTracksMock.mockResolvedValue([
            { title: 'Seed', artist: 'Artist' },
        ])
        searchLastFmQueryMock.mockResolvedValue([])
        const queue = { player: { search: jest.fn() } } as never
        const ctx = createCtx()
        // Pre-fill candidates to buffer size (8)
        for (let i = 0; i < 8; i++) {
            ctx.candidates.set(`key-${i}`, {
                track: {} as never,
                score: 0.5,
                basis: { source: 'spotify-rec', signals: [] },
            })
        }

        await collectGenreCandidates(
            queue,
            ['rock', 'pop'],
            { id: 'user-1' } as never,
            ctx,
        )

        expect(getTagTopTracksMock).not.toHaveBeenCalled()
    })

    it('skips track when shouldIncludeCandidate returns false', async () => {
        const foundTrack = {
            title: 'T1',
            author: 'A1',
            url: 'u1',
            durationMS: 180_000,
        }
        getTagTopTracksMock.mockResolvedValue([
            { title: 'Seed', artist: 'Artist' },
        ])
        searchLastFmQueryMock.mockResolvedValue([foundTrack])
        shouldIncludeCandidateMock.mockReturnValue(false)
        const queue = { player: { search: jest.fn() } } as never
        const ctx = createCtx()

        await collectGenreCandidates(
            queue,
            ['rock'],
            { id: 'user-1' } as never,
            ctx,
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

    it('does not throw when queue.player.search rejects', async () => {
        const searchMock = jest
            .fn()
            .mockRejectedValue(new Error('network error'))
        const queue = {
            player: { search: searchMock },
        } as never
        const currentTrack = {
            author: 'Artist',
            title: 'Song',
            url: 'u1',
            durationMS: 200_000,
        } as never
        const candidates = new Map<string, ScoredTrack>()

        const ctx = createAutoplayContext({
            queue,
            currentTrack,
        })
        await expect(
            collectBroadFallbackCandidates(ctx, candidates),
        ).resolves.toBeUndefined()
    })

    it('adds candidates when search returns tracks', async () => {
        const foundTrack = {
            title: 'Found',
            author: 'Artist',
            url: 'u2',
            durationMS: 180_000,
        }
        const searchMock = jest.fn().mockResolvedValue({ tracks: [foundTrack] })
        const queue = { player: { search: searchMock } } as never
        const currentTrack = {
            author: 'Artist',
            title: 'Song',
            url: 'u1',
            durationMS: 200_000,
        } as never
        const candidates = new Map<string, ScoredTrack>()

        const ctx = createAutoplayContext({
            queue,
            currentTrack,
        })
        await collectBroadFallbackCandidates(ctx, candidates)

        expect(upsertScoredCandidateMock).toHaveBeenCalled()
    })

    it('skips tracks when shouldIncludeCandidate returns false', async () => {
        const foundTrack = {
            title: 'Found',
            author: 'Artist',
            url: 'u2',
            durationMS: 180_000,
        }
        const searchMock = jest.fn().mockResolvedValue({ tracks: [foundTrack] })
        const queue = { player: { search: searchMock } } as never
        const currentTrack = {
            author: 'Artist',
            title: 'Song',
            url: 'u1',
            durationMS: 200_000,
        } as never
        shouldIncludeCandidateMock.mockReturnValue(false)
        const candidates = new Map<string, ScoredTrack>()

        const ctx = createAutoplayContext({
            queue,
            currentTrack,
        })
        await collectBroadFallbackCandidates(ctx, candidates)

        expect(upsertScoredCandidateMock).not.toHaveBeenCalled()
    })

    it('fetches artist tags via genreContext.getArtistTags and passes them to scorer', async () => {
        const foundTrack = {
            title: 'Eres Fiel',
            author: 'Marcos Witt',
            url: 'u2',
            durationMS: 180_000,
        }
        const searchMock = jest.fn().mockResolvedValue({ tracks: [foundTrack] })
        const queue = { player: { search: searchMock } } as never
        const currentTrack = {
            author: 'Artist',
            title: 'Song',
            url: 'u1',
            durationMS: 200_000,
        } as never
        const getArtistTagsMock = jest
            .fn()
            .mockResolvedValue(['latin christian', 'spanish gospel'])
        const candidates = new Map<string, ScoredTrack>()

        const ctx = createAutoplayContext({
            queue,
            currentTrack,
            genreContext: {
                getArtistTags: getArtistTagsMock,
                currentTrackTags: ['rock'],
                sessionGenreFamilies: new Set(['rock_metal']),
            },
        })
        await collectBroadFallbackCandidates(ctx, candidates)

        expect(getArtistTagsMock).toHaveBeenCalledWith('Marcos Witt')
        expect(calculateRecommendationScoreMock).toHaveBeenCalledWith(
            expect.objectContaining({
                genreContext: expect.objectContaining({
                    candidateTags: ['latin christian', 'spanish gospel'],
                    currentTrackTags: ['rock'],
                    sessionGenreFamilies: expect.any(Set),
                }),
            }),
        )
    })

    it('falls back to empty tags when getArtistTags rejects', async () => {
        const foundTrack = {
            title: 'Song',
            author: 'Artist',
            url: 'u2',
            durationMS: 180_000,
        }
        const searchMock = jest.fn().mockResolvedValue({ tracks: [foundTrack] })
        const queue = { player: { search: searchMock } } as never
        const currentTrack = {
            author: 'Artist',
            title: 'Song',
            url: 'u1',
            durationMS: 200_000,
        } as never
        const getArtistTagsMock = jest
            .fn()
            .mockRejectedValue(new Error('lastfm down'))
        const candidates = new Map<string, ScoredTrack>()

        const ctx = createAutoplayContext({
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
    })

    it('uses Last.fm tags when getArtistTags returns them', async () => {
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

        expect(getArtistTagsMock).toHaveBeenCalledWith('Felipe Dutra')
        expect(calculateRecommendationScoreMock).toHaveBeenCalledWith(
            expect.objectContaining({
                genreContext: expect.objectContaining({
                    candidateTags: ['latin gospel', 'latin christian'],
                }),
            }),
        )
    })

    it('does not fetch Spotify genres when Last.fm tags are already populated', async () => {
        const foundTrack = {
            title: 'Song',
            author: 'Artist',
            url: 'u2',
            durationMS: 180_000,
        }
        const searchMock = jest.fn().mockResolvedValue({ tracks: [foundTrack] })
        const queue = { player: { search: searchMock } } as never
        const currentTrack = {
            author: 'Artist',
            title: 'Song',
            url: 'u1',
            durationMS: 200_000,
        } as never
        const getArtistTagsMock = jest.fn().mockResolvedValue(['rock', 'indie'])
        getValidAccessTokenMock.mockResolvedValue('spotify-token')
        const candidates = new Map<string, ScoredTrack>()

        const ctx = createAutoplayContext({
            queue,
            currentTrack,
            genreContext: { getArtistTags: getArtistTagsMock },
        })
        await collectBroadFallbackCandidates(ctx, candidates)

        expect(getArtistGenresMock).not.toHaveBeenCalled()
    })

    it('does not fetch Spotify genres when no user token is available', async () => {
        const foundTrack = {
            title: 'Hallelujah',
            author: 'Felipe Dutra',
            url: 'u2',
            durationMS: 180_000,
        }
        const searchMock = jest.fn().mockResolvedValue({ tracks: [foundTrack] })
        const queue = { player: { search: searchMock } } as never
        const currentTrack = {
            author: 'Artist',
            title: 'Song',
            url: 'u1',
            durationMS: 200_000,
        } as never
        const getArtistTagsMock = jest.fn().mockResolvedValue([])
        getValidAccessTokenMock.mockResolvedValue(null)
        const candidates = new Map<string, ScoredTrack>()

        const ctx = createAutoplayContext({
            queue,
            currentTrack,
            genreContext: { getArtistTags: getArtistTagsMock },
        })
        await collectBroadFallbackCandidates(ctx, candidates)

        expect(getArtistGenresMock).not.toHaveBeenCalled()
    })
})
