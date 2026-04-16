import { jest } from '@jest/globals'
import type { Track, GuildQueue } from 'discord-player'
import { QueryType } from 'discord-player'
import type { SpotifyAudioFeatures } from '../../../spotify/spotifyApi'
import {
    collectSpotifyRecommendationCandidates,
    searchSeedCandidates,
} from './spotifyRecommender'
import type { SessionMood } from './sessionMood'

jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
    errorLog: jest.fn(),
    warnLog: jest.fn(),
}))

const spotifyLinkServiceMock = jest.fn()
const searchSpotifyTrackMock = jest.fn()
const getSpotifyRecommendationsMock = jest.fn()

jest.mock('@lucky/shared/services', () => ({
    spotifyLinkService: {
        getValidAccessToken: (...args: unknown[]) =>
            spotifyLinkServiceMock(...args),
    },
}))

jest.mock('../../../spotify/spotifyApi', () => ({
    searchSpotifyTrack: (...args: unknown[]) =>
        searchSpotifyTrackMock(...args),
    getSpotifyRecommendations: (...args: unknown[]) =>
        getSpotifyRecommendationsMock(...args),
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

describe('spotifyRecommender', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        spotifyLinkServiceMock.mockResolvedValue('test-token')
        searchSpotifyTrackMock.mockResolvedValue('spotify-id')
        getSpotifyRecommendationsMock.mockResolvedValue([])
    })

    describe('collectSpotifyRecommendationCandidates', () => {
        it('returns early if requestedBy is null', async () => {
            const queue = createMockQueue()
            const candidates = new Map()

            await collectSpotifyRecommendationCandidates(
                queue,
                [createTrack()],
                null,
                new Set(),
                new Set(),
                new Map(),
                new Map(),
                new Set(),
                new Set(),
                createTrack(),
                new Set(),
                candidates,
                'similar',
                new Map(),
                new Set(),
                new Set(),
                null,
                null,
            )

            expect(candidates.size).toBe(0)
            expect(spotifyLinkServiceMock).not.toHaveBeenCalled()
        })

        it('returns early if no valid token', async () => {
            spotifyLinkServiceMock.mockRejectedValue(new Error('No token'))
            const queue = createMockQueue()
            const candidates = new Map()
            const user = { id: 'user123' } as any

            await collectSpotifyRecommendationCandidates(
                queue,
                [createTrack()],
                user,
                new Set(),
                new Set(),
                new Map(),
                new Map(),
                new Set(),
                new Set(),
                createTrack(),
                new Set(),
                candidates,
                'similar',
                new Map(),
                new Set(),
                new Set(),
                null,
                null,
            )

            expect(candidates.size).toBe(0)
        })

        it('returns early if no seed IDs found', async () => {
            const queue = createMockQueue()
            const candidates = new Map()
            const user = { id: 'user123' } as any
            const track = createTrack({ url: 'https://youtube.com/watch?v=test' })

            await collectSpotifyRecommendationCandidates(
                queue,
                [track],
                user,
                new Set(),
                new Set(),
                new Map(),
                new Map(),
                new Set(),
                new Set(),
                createTrack(),
                new Set(),
                candidates,
                'similar',
                new Map(),
                new Set(),
                new Set(),
                null,
                null,
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

            await collectSpotifyRecommendationCandidates(
                queueMock,
                [track],
                user,
                new Set(),
                new Set(),
                new Map(),
                new Map(),
                new Set(),
                new Set(),
                createTrack(),
                new Set(),
                candidates,
                'similar',
                new Map(),
                new Set(),
                new Set(),
                null,
                null,
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

            await collectSpotifyRecommendationCandidates(
                queueMock,
                [createTrack({ url: 'spotify:track:abc123' })],
                user,
                new Set(),
                new Set(),
                new Map(),
                new Map(),
                new Set(),
                new Set(),
                createTrack(),
                new Set(),
                candidates,
                'similar',
                new Map(),
                new Set(),
                new Set(),
                null,
                null,
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

            await collectSpotifyRecommendationCandidates(
                queueMock,
                [createTrack({ url: 'spotify:track:abc123' })],
                user,
                new Set(),
                new Set(),
                new Map(),
                new Map(),
                new Set(),
                new Set(),
                createTrack(),
                new Set(),
                candidates,
                'similar',
                new Map(),
                new Set(),
                new Set(),
                null,
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
    })

    describe('searchSeedCandidates', () => {
        it('returns empty array on failure', async () => {
            const queueMock = createMockQueue()
            ;(queueMock.player.search as jest.Mock).mockRejectedValue(
                new Error('Search failed'),
            )

            const user = { id: 'user123' } as any

            const result = await searchSeedCandidates(
                queueMock,
                createTrack(),
                user,
                0,
            )

            expect(result).toEqual([])
        })

        it('returns tracks from first successful engine', async () => {
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
                0,
            )

            expect(result).toEqual(tracks)
            expect(queueMock.player.search).toHaveBeenCalledWith(
                expect.any(String),
                {
                    requestedBy: user,
                    searchEngine: QueryType.SPOTIFY_SEARCH,
                },
            )
        })

        it('tries fallback engines on failure', async () => {
            const queueMock = createMockQueue()
            ;(queueMock.player.search as jest.Mock)
                .mockResolvedValueOnce({ tracks: [] })
                .mockResolvedValueOnce({
                    tracks: [createTrack({ title: 'YouTube result' })],
                })

            const user = { id: 'user123' } as any

            const result = await searchSeedCandidates(
                queueMock,
                createTrack(),
                user,
                0,
            )

            expect(result.length).toBeGreaterThan(0)
            expect(queueMock.player.search).toHaveBeenCalledTimes(2)
        })

        it('applies query modifiers based on replenishCount for non-Spotify', async () => {
            const queueMock = createMockQueue()
            ;(queueMock.player.search as jest.Mock)
                .mockResolvedValueOnce({ tracks: [] })
                .mockResolvedValueOnce({
                    tracks: [createTrack()],
                })

            const user = { id: 'user123' } as any

            await searchSeedCandidates(
                queueMock,
                createTrack({ title: 'Test', author: 'Artist' }),
                user,
                1,
            )

            const youtubeCall = (queueMock.player.search as jest.Mock).mock
                .calls[1][0]
            expect(youtubeCall).toContain('similar')
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

            const user = { id: 'user123' } as any

            const result = await searchSeedCandidates(
                queueMock,
                createTrack(),
                user,
                0,
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

            const user = { id: 'user123' } as any

            const result = await searchSeedCandidates(
                queueMock,
                createTrack(),
                user,
                0,
            )

            expect(result.length).toBeLessThanOrEqual(8)
        })

        it('uses different search query for non-Spotify engines', async () => {
            const queueMock = createMockQueue()
            ;(queueMock.player.search as jest.Mock)
                .mockResolvedValueOnce({ tracks: [] })
                .mockResolvedValueOnce({
                    tracks: [createTrack({ source: 'youtube' })],
                })

            const user = { id: 'user123' } as any

            await searchSeedCandidates(
                queueMock,
                createTrack(),
                user,
                0,
            )

            const calls = (queueMock.player.search as jest.Mock).mock.calls
            const spotifyCall = calls[0][0]
            const youtubeCall = calls[1][0]

            expect(typeof spotifyCall).toBe('string')
            expect(typeof youtubeCall).toBe('string')
        })
    })
})
