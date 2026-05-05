import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import type { ScoredTrack } from './autoplay/candidateCollector'

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

jest.mock('discord-player', () => ({
    QueryType: { SPOTIFY_SEARCH: 'spotify_search', AUTO: 'auto' },
}))

jest.mock('../../spotify/spotifyApi', () => ({
    getBatchAudioFeatures: (...args: unknown[]) => getBatchAudioFeaturesMock(...args),
    getArtistGenres: (...args: unknown[]) => getArtistGenresMock(...args),
}))

jest.mock('@lucky/shared/services', () => ({
    spotifyLinkService: {
        getValidAccessToken: (...args: unknown[]) => getValidAccessTokenMock(...args),
    },
}))

jest.mock('../../lastfm', () => ({
    getTagTopTracks: (...args: unknown[]) => getTagTopTracksMock(...args),
}))

jest.mock('./autoplay/lastFmSeeder', () => ({
    searchLastFmQuery: (...args: unknown[]) => searchLastFmQueryMock(...args),
}))

jest.mock('./autoplay/candidateCollector', () => ({
    shouldIncludeCandidate: (...args: unknown[]) => shouldIncludeCandidateMock(...args),
    upsertScoredCandidate: (...args: unknown[]) => upsertScoredCandidateMock(...args),
}))

jest.mock('./autoplay/candidateScorer', () => ({
    calculateRecommendationScore: (...args: unknown[]) => calculateRecommendationScoreMock(...args),
}))

jest.mock('./searchQueryCleaner', () => ({
    cleanSearchQuery: (...args: unknown[]) => cleanSearchQueryMock(...args),
    cleanAuthor: (...args: unknown[]) => cleanAuthorMock(...args),
}))

jest.mock('./trackNormalization', () => ({
    normalizeTrackKey: (...args: unknown[]) => normalizeTrackKeyMock(...args),
    calculateGenreFamilyPenalty: (...args: unknown[]) => calculateGenreFamilyPenaltyMock(...args),
}))

import {
    interleaveByArtist,
    enrichWithAudioFeatures,
    collectBroadFallbackCandidates,
} from './candidateFallback'

function createScoredTrack(author: string, score = 0.5, url = 'https://url'): ScoredTrack {
    return {
        track: {
            title: 'Track',
            author,
            url,
            durationMS: 200_000,
        } as never,
        score,
        reason: 'test reason',
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
        const features = { energy: 0.7, valence: 0.5, danceability: 0.6, tempo: 120, acousticness: 0.1, instrumentalness: 0.0 }
        const result = await enrichWithAudioFeatures(tracks, '', features as never)
        expect(result).toBe(tracks)
    })

    it('returns tracks unchanged when no spotify token available', async () => {
        getValidAccessTokenMock.mockResolvedValue(null)
        const tracks = [createScoredTrack('Artist A')]
        const features = { energy: 0.7, valence: 0.5 }
        const result = await enrichWithAudioFeatures(tracks, 'user1', features as never)
        expect(result).toBe(tracks)
    })

    it('returns tracks unchanged when no tracks have spotify URLs', async () => {
        getValidAccessTokenMock.mockResolvedValue('token123')
        const tracks = [createScoredTrack('Artist A', 0.5, 'https://youtube.com/watch?v=abc')]
        const features = { energy: 0.7, valence: 0.5 }
        const result = await enrichWithAudioFeatures(tracks, 'user1', features as never)
        expect(result).toBe(tracks)
    })

    it('boosts score when energy and valence are within close range', async () => {
        getValidAccessTokenMock.mockResolvedValue('token123')
        const spotifyUrl = 'https://open.spotify.com/track/abc123def456'
        const track = createScoredTrack('Artist A', 0.5, spotifyUrl)
        const currentFeatures = { energy: 0.7, valence: 0.5 }
        const trackFeatures = new Map([['abc123def456', { energy: 0.72, valence: 0.55 }]])
        getBatchAudioFeaturesMock.mockResolvedValue(trackFeatures)
        getArtistGenresMock.mockResolvedValue([])

        const result = await enrichWithAudioFeatures([track], 'user1', currentFeatures as never)
        expect(result[0].score).toBeGreaterThan(0.5)
    })

    it('penalizes score when energy delta is very high and valence delta is also high', async () => {
        getValidAccessTokenMock.mockResolvedValue('token123')
        const spotifyUrl = 'https://open.spotify.com/track/abc123def456'
        const track = createScoredTrack('Artist A', 0.5, spotifyUrl)
        // energyDelta=0.8, valenceDelta=0.4 — second else-if branch misses (0.8>=0.3 AND 0.4>=0.35), third branch hits
        const currentFeatures = { energy: 0.1, valence: 0.1 }
        const trackFeatures = new Map([['abc123def456', { energy: 0.9, valence: 0.5 }]])
        getBatchAudioFeaturesMock.mockResolvedValue(trackFeatures)
        getArtistGenresMock.mockResolvedValue([])

        const result = await enrichWithAudioFeatures([track], 'user1', currentFeatures as never)
        expect(result[0].score).toBeLessThan(0.5)
    })
})

describe('collectBroadFallbackCandidates', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        normalizeTrackKeyMock.mockReturnValue('normalized-key')
        shouldIncludeCandidateMock.mockReturnValue(true)
        calculateRecommendationScoreMock.mockReturnValue({ score: 0.5, reason: 'test' })
    })

    it('does not throw when queue.player.search rejects', async () => {
        const searchMock = jest.fn().mockRejectedValue(new Error('network error'))
        const queue = {
            player: { search: searchMock },
        } as never
        const currentTrack = { author: 'Artist', title: 'Song', url: 'u1', durationMS: 200_000 } as never
        const candidates = new Map<string, ScoredTrack>()

        await expect(
            collectBroadFallbackCandidates(
                queue,
                currentTrack,
                null,
                new Set(),
                new Set(),
                new Map(),
                new Map(),
                new Set(),
                new Set(),
                new Set(),
                candidates,
            ),
        ).resolves.toBeUndefined()
    })

    it('adds candidates when search returns tracks', async () => {
        const foundTrack = { title: 'Found', author: 'Artist', url: 'u2', durationMS: 180_000 }
        const searchMock = jest.fn().mockResolvedValue({ tracks: [foundTrack] })
        const queue = { player: { search: searchMock } } as never
        const currentTrack = { author: 'Artist', title: 'Song', url: 'u1', durationMS: 200_000 } as never
        const candidates = new Map<string, ScoredTrack>()

        await collectBroadFallbackCandidates(
            queue,
            currentTrack,
            null,
            new Set(),
            new Set(),
            new Map(),
            new Map(),
            new Set(),
            new Set(),
            new Set(),
            candidates,
        )

        expect(upsertScoredCandidateMock).toHaveBeenCalled()
    })
})
