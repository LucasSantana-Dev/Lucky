import { jest } from '@jest/globals'
import type { Track, GuildQueue } from 'discord-player'
import { QueryType } from 'discord-player'
import type { SpotifyAudioFeatures } from '../../../spotify/spotifyApi'
import {
    collectSpotifyRecommendationCandidates,
    searchSeedCandidates,
} from './spotifyRecommender'
import type { SessionMood } from './sessionMood'
import type { AutoplayContext } from './autoplayContext'

jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
    errorLog: jest.fn(),
    warnLog: jest.fn(),
}))

const spotifyLinkServiceMock = jest.fn()
const searchSpotifyTrackMock = jest.fn()
const getSpotifyRecommendationsMock = jest.fn()
const getArtistGenresMock = jest.fn()

jest.mock('@lucky/shared/services', () => ({
    spotifyLinkService: {
        getValidAccessToken: (...args: unknown[]) =>
            spotifyLinkServiceMock(...args),
    },
}))

jest.mock('../../../spotify/spotifyApi', () => ({
    searchSpotifyTrack: (...args: unknown[]) => searchSpotifyTrackMock(...args),
    getSpotifyRecommendations: (...args: unknown[]) =>
        getSpotifyRecommendationsMock(...args),
    getArtistGenres: (...args: unknown[]) => getArtistGenresMock(...args),
}))

jest.mock('../searchQueryCleaner', () => ({
    cleanTitle: (s: string) => s,
    cleanAuthor: (s: string) => s,
    extractSongCore: jest.fn(() => null),
    cleanSearchQuery: (title: string) => title,
}))

function createTrack(overrides: Partial<Track> = {}): Track {
    return {
        title: 'Test Song',
        author: 'Test Artist',
        durationMS: 3 * 60 * 1000,
        url: 'https://open.spotify.com/track/testid',
        source: 'spotify',
        ...overrides,
    } as Track
}

function createMockQueue(overrides: Partial<GuildQueue> = {}): GuildQueue {
    return {
        player: {
            search: jest.fn(),
        },
        ...overrides,
    } as unknown as GuildQueue
}

function createAutoplayContext(
    overrides: Partial<AutoplayContext> = {},
): AutoplayContext {
    const queue = createMockQueue()
    const currentTrack = createTrack()
    return {
        queue,
        excludedUrls: new Set(),
        excludedKeys: new Set(),
        dislikedWeights: new Map(),
        likedWeights: new Map(),
        preferredArtistKeys: new Set(),
        blockedArtistKeys: new Set(),
        currentTrack,
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

describe('spotifyRecommender', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        spotifyLinkServiceMock.mockResolvedValue('test-token')
        searchSpotifyTrackMock.mockResolvedValue('spotify-id')
        getSpotifyRecommendationsMock.mockResolvedValue([])
        getArtistGenresMock.mockResolvedValue([])
    })

    describe('collectSpotifyRecommendationCandidates', () => {
        it('returns early if requestedBy is null', async () => {
            const queue = createMockQueue()
            const candidates = new Map()
            const ctx = createAutoplayContext({ queue })

            await collectSpotifyRecommendationCandidates(
                ctx,
                [createTrack()],
                null,
                candidates,
            )

            expect(candidates.size).toBe(0)
            expect(spotifyLinkServiceMock).not.toHaveBeenCalled()
        })

        it('returns early if no valid token', async () => {
            spotifyLinkServiceMock.mockRejectedValue(new Error('No token'))
            const queue = createMockQueue()
            const candidates = new Map()
            const user = { id: 'user123' } as any
            const ctx = createAutoplayContext({ queue })

            await collectSpotifyRecommendationCandidates(
                ctx,
                [createTrack()],
                user,
                candidates,
            )

            expect(candidates.size).toBe(0)
        })

        it('returns early if no seed IDs found', async () => {
            const queue = createMockQueue()
            const candidates = new Map()
            const user = { id: 'user123' } as any
            const track = createTrack({
                url: 'https://youtube.com/watch?v=test',
            })
            const ctx = createAutoplayContext({ queue })

            await collectSpotifyRecommendationCandidates(
                ctx,
                [track],
                user,
                candidates,
            )

            expect(candidates.size).toBe(0)
        })

        it('extracts Spotify track IDs from URLs', async () => {
            getSpotifyRecommendationsMock.mockResolvedValue([
                { id: 'rec-id-1' },
            ] as any)

            const queueMock = createMockQueue()
            ;(queueMock.player.search as jest.Mock).mockResolvedValue({
                tracks: [createTrack({ durationMS: 3 * 60 * 1000 })],
            })

            const candidates = new Map()
            const user = { id: 'user123' } as any
            const track = createTrack({
                url: 'https://open.spotify.com/track/abc123def456',
            })
            const ctx = createAutoplayContext({ queue: queueMock })

            await collectSpotifyRecommendationCandidates(
                ctx,
                [track],
                user,
                candidates,
            )

            expect(getSpotifyRecommendationsMock).toHaveBeenCalledWith(
                'test-token',
                ['abc123def456'],
                15,
                undefined,
            )
        })

        it('filters out tracks exceeding max duration', async () => {
            getSpotifyRecommendationsMock.mockResolvedValue([
                { id: 'rec-id-1' },
            ] as any)

            const queueMock = createMockQueue()
            ;(queueMock.player.search as jest.Mock).mockResolvedValue({
                tracks: [
                    createTrack({ durationMS: 8 * 60 * 1000 }),
                    createTrack({ durationMS: 3 * 60 * 1000 }),
                ],
            })

            const candidates = new Map()
            const user = { id: 'user123' } as any
            const ctx = createAutoplayContext({ queue: queueMock })

            await collectSpotifyRecommendationCandidates(
                ctx,
                [createTrack({ url: 'spotify:track:abc123' })],
                user,
                candidates,
            )

            expect(candidates.size).toBeGreaterThan(0)
        })

        it('respects audio feature constraints', async () => {
            const audioConstraints: SpotifyAudioFeatures = {
                energy: 0.5,
                valence: 0.6,
                danceability: 0.7,
                acousticness: 0.2,
                instrumentalness: 0.1,
                liveness: 0.3,
                loudness: -5,
                speechiness: 0.04,
                tempo: 120,
                key: 0,
                mode: 1,
                time_signature: 4,
            }

            getSpotifyRecommendationsMock.mockResolvedValue([
                { id: 'rec-id-1' },
            ] as any)

            const queueMock = createMockQueue()
            ;(queueMock.player.search as jest.Mock).mockResolvedValue({
                tracks: [createTrack()],
            })

            const candidates = new Map()
            const user = { id: 'user123' } as any
            const ctx = createAutoplayContext({ queue: queueMock })

            await collectSpotifyRecommendationCandidates(
                ctx,
                [createTrack({ url: 'spotify:track:abc123' })],
                user,
                candidates,
                audioConstraints,
            )

            expect(getSpotifyRecommendationsMock).toHaveBeenCalledWith(
                'test-token',
                ['abc123'],
                15,
                {
                    energy: 0.5,
                    valence: 0.6,
                    danceability: 0.7,
                },
            )
        })

        it('falls back to Spotify genres when Last.fm tags are empty and rejects Spanish gospel', async () => {
            // Simulates the case where Last.fm is not linked: artistTagCache returns []
            // and Spotify genres identify the artist as latin gospel → cross-locale veto fires
            getSpotifyRecommendationsMock.mockResolvedValue([
                { id: 'rec-gospel' },
            ] as any)
            // getArtistTags returns [] (no Last.fm)
            // getArtistGenres returns Spotify genre tags that reveal Spanish content
            getArtistGenresMock.mockResolvedValue([
                'musica cristiana',
                'latin gospel',
            ])

            const queueMock = createMockQueue()
            ;(queueMock.player.search as jest.Mock).mockResolvedValue({
                tracks: [
                    createTrack({ title: 'Hosanna', author: 'Marcos Witt' }),
                ],
            })

            const candidates = new Map()
            const user = { id: 'user123' } as any
            const sessionMood = {
                deepDiveArtist: null,
                preferLong: false,
                preferShort: false,
                restless: false,
                dominantLocale: null,
                recentSkipCount: 0,
            }
            const ctx = createAutoplayContext({
                queue: queueMock,
                sessionMood,
            })

            await collectSpotifyRecommendationCandidates(
                ctx,
                [createTrack({ url: 'https://open.spotify.com/track/seed1' })],
                user,
                candidates,
            )

            // Spanish gospel track with neutral English title must be rejected
            expect(candidates.size).toBe(0)
            expect(getArtistGenresMock).toHaveBeenCalledWith(
                'test-token',
                'Marcos Witt',
            )
        })

        it('uses Spotify genres only when Last.fm tags are absent (does not double-fetch)', async () => {
            getSpotifyRecommendationsMock.mockResolvedValue([
                { id: 'rec-1' },
            ] as any)
            // When Last.fm DOES return tags, getArtistGenres should NOT be called
            const mockGetArtistTags = jest
                .fn()
                .mockResolvedValue(['pop', 'indie'])
            getArtistGenresMock.mockResolvedValue(['pop'])

            const queueMock = createMockQueue()
            ;(queueMock.player.search as jest.Mock).mockResolvedValue({
                tracks: [createTrack()],
            })

            const candidates = new Map()
            const user = { id: 'user123' } as any
            const ctx = createAutoplayContext({
                queue: queueMock,
                genreContext: { getArtistTags: mockGetArtistTags },
            })

            await collectSpotifyRecommendationCandidates(
                ctx,
                [createTrack({ url: 'https://open.spotify.com/track/seed1' })],
                user,
                candidates,
            )

            // Last.fm tags were returned, so getArtistGenres should not be called
            expect(getArtistGenresMock).not.toHaveBeenCalled()
        })
    })

    describe('searchSeedCandidates', () => {
        it('returns empty array on search failure', async () => {
            const queueMock = createMockQueue()
            ;(queueMock.player.search as jest.Mock).mockRejectedValue(
                new Error('Search failed'),
            )

            const result = await searchSeedCandidates(
                queueMock,
                createTrack(),
                { id: 'user123' } as any,
            )

            expect(result).toEqual([])
        })

        it('returns empty array when Spotify returns 0 results — no YouTube fallback', async () => {
            const queueMock = createMockQueue()
            ;(queueMock.player.search as jest.Mock).mockResolvedValue({
                tracks: [],
            })

            const result = await searchSeedCandidates(
                queueMock,
                createTrack(),
                { id: 'user123' } as any,
            )

            expect(result).toEqual([])
            expect(queueMock.player.search).toHaveBeenCalledTimes(1)
            expect(queueMock.player.search).toHaveBeenCalledWith(
                expect.any(String),
                {
                    requestedBy: expect.anything(),
                    searchEngine: QueryType.SPOTIFY_SEARCH,
                },
            )
        })

        it('uses only Spotify search engine', async () => {
            const queueMock = createMockQueue()
            const tracks = [createTrack({ title: 'Result 1' })]
            ;(queueMock.player.search as jest.Mock).mockResolvedValue({
                tracks,
            })

            const user = { id: 'user123' } as any
            const result = await searchSeedCandidates(
                queueMock,
                createTrack(),
                user,
            )

            expect(result).toEqual(tracks)
            expect(queueMock.player.search).toHaveBeenCalledTimes(1)
            expect(queueMock.player.search).toHaveBeenCalledWith(
                expect.any(String),
                { requestedBy: user, searchEngine: QueryType.SPOTIFY_SEARCH },
            )
        })

        it('filters tracks exceeding max duration', async () => {
            const queueMock = createMockQueue()
            ;(queueMock.player.search as jest.Mock).mockResolvedValue({
                tracks: [
                    createTrack({ durationMS: 8 * 60 * 1000 }),
                    createTrack({ durationMS: 3 * 60 * 1000 }),
                    createTrack({ durationMS: 2 * 60 * 1000 }),
                ],
            })

            const result = await searchSeedCandidates(
                queueMock,
                createTrack(),
                { id: 'user123' } as any,
            )

            expect(result.length).toBeLessThanOrEqual(2)
            result.forEach((track) => {
                if (track.durationMS) {
                    expect(track.durationMS).toBeLessThanOrEqual(7 * 60 * 1000)
                }
            })
        })

        it('limits results to SEARCH_RESULTS_LIMIT', async () => {
            const queueMock = createMockQueue()
            const manyTracks = Array.from({ length: 20 }, (_, i) =>
                createTrack({ title: `Song ${i}` }),
            )
            ;(queueMock.player.search as jest.Mock).mockResolvedValue({
                tracks: manyTracks,
            })

            const result = await searchSeedCandidates(
                queueMock,
                createTrack(),
                { id: 'user123' } as any,
            )

            expect(result.length).toBeLessThanOrEqual(8)
        })
    })
})
