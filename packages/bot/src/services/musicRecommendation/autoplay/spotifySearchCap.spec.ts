import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import type { GuildQueue, Track } from 'discord-player'
import type { AutoplayContext } from './autoplayContext'

const getSimilarTracksMock = jest.fn<() => Promise<unknown[]>>()
const getArtistTopTracksMock = jest.fn<() => Promise<unknown[]>>()
const getSimilarArtistsMock = jest.fn<() => Promise<unknown[]>>()
const getTagTopTracksMock = jest.fn<() => Promise<unknown[]>>()

jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
    warnLog: jest.fn(),
}))
jest.mock('@lucky/shared/utils/error', () => ({
    logAndSwallow: jest.fn(),
    logAndWarn: jest.fn(),
}))
jest.mock('@lucky/shared/services', () => ({ lastFmLinkService: {} }))
jest.mock('../../../handlers/player/spotifyApiFailureLog', () => ({
    isSpotifyBlocked: () => false,
}))
jest.mock('../../../lastfm', () => ({
    getSimilarTracks: () => getSimilarTracksMock(),
    getArtistTopTracks: () => getArtistTopTracksMock(),
    getSimilarArtists: () => getSimilarArtistsMock(),
    getTagTopTracks: () => getTagTopTracksMock(),
}))
jest.mock('./artistTagCache', () => ({
    createArtistTagFetcher: () => async () => [],
}))
jest.mock('./candidateScorer', () => ({
    calculateRecommendationScore: () => ({ score: 0.5, signals: [] }),
    getGenreFamilies: () => new Set(),
}))
jest.mock('./candidateCollector', () => ({
    shouldIncludeCandidate: () => true,
    upsertScoredCandidate: () => true,
}))

import { collectSeedSimilarCandidates } from './seedSimilarityCollector'
import {
    collectRelatedArtistCandidates,
    __resetRelatedArtistCacheForTests,
} from './relatedArtistCollector'
import { collectGenreCandidates } from '../candidateFallback'
import {
    MAX_SPOTIFY_SEARCHES_PER_REPLENISH,
    spotifySearchBudgetFor,
} from './lastFmSeeder'

const many = (prefix: string, n: number) =>
    Array.from({ length: n }, (_, i) => ({
        title: `${prefix} ${i}`,
        artist: `${prefix} Artist ${i}`,
        name: `${prefix} Artist ${i}`,
        match: 1,
    }))

describe('one replenish spends at most the Spotify search cap (#2971)', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        __resetRelatedArtistCacheForTests()
        getSimilarTracksMock.mockResolvedValue(many('Sim', 8))
        getArtistTopTracksMock.mockResolvedValue(many('Top', 8))
        getSimilarArtistsMock.mockResolvedValue(many('Rel', 4))
        getTagTopTracksMock.mockResolvedValue(many('Tag', 8))
    })

    it('counts SPOTIFY_SEARCH calls across seed, related and genre collectors', async () => {
        const search = jest.fn(async () => ({ tracks: [] as Track[] }))
        const queue = { player: { search } } as unknown as GuildQueue
        const track = { title: 'Seed', author: 'Seed Artist' } as Track
        const ctx = {
            queue,
            excludedUrls: new Set(),
            excludedKeys: new Set(),
            dislikedWeights: new Map(),
            likedWeights: new Map(),
            preferredArtistKeys: new Set(),
            blockedArtistKeys: new Set(),
            currentTrack: track,
            recentArtists: new Set(),
            autoplayMode: 'similar',
            artistFrequency: new Map(),
            implicitDislikeKeys: new Set(),
            implicitLikeKeys: new Set(),
            sessionMood: null,
            genreContext: {},
            seedArtistStreak: 1,
        } as unknown as AutoplayContext
        const user = { id: 'u1' } as never
        const candidates = new Map()

        await collectSeedSimilarCandidates(ctx, user, candidates)
        await collectRelatedArtistCandidates(ctx, user, candidates)
        await collectGenreCandidates(queue, ['rock'], user, {
            candidates,
            recentArtists: new Set(),
            likedTrackKeys: new Map(),
            dislikedTrackKeys: new Map(),
            currentTrack: track,
            excludedUrls: new Set(),
            excludedKeys: new Set(),
            preferredArtistKeys: new Set(),
            blockedArtistKeys: new Set(),
            autoplayMode: 'similar',
            spotifySearchBudget: spotifySearchBudgetFor(ctx),
        })

        const spotifyCalls = (
            search.mock.calls as unknown as [string, { searchEngine: string }][]
        ).filter(([, opts]) => opts.searchEngine === 'spotifySearch')
        expect(spotifyCalls.length).toBe(MAX_SPOTIFY_SEARCHES_PER_REPLENISH)
        expect(search.mock.calls.length).toBeGreaterThan(spotifyCalls.length)
    })
})
