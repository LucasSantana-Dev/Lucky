import {
    describe,
    it,
    expect,
    beforeEach,
    jest,
    afterEach,
} from '@jest/globals'
import {
    getAudioFeatures,
    searchSpotifyTrack,
    getBatchAudioFeatures,
    getArtistPopularity,
    getSpotifyRecommendations,
    getArtistGenres,
    getUserTopArtistsAndTracks,
} from './spotifyApi'

type MockFetchResponse = {
    ok: boolean
    json?: () => Promise<unknown>
}

const fetchMock =
    jest.fn<
        (
            input: RequestInfo | URL,
            init?: RequestInit,
        ) => Promise<MockFetchResponse>
    >()

describe('spotifyApi', () => {
    let originalFetch: typeof global.fetch

    beforeEach(() => {
        originalFetch = global.fetch
        jest.clearAllMocks()
        ;(globalThis as { fetch: typeof fetch }).fetch =
            fetchMock as unknown as typeof fetch
    })

    afterEach(() => {
        global.fetch = originalFetch
    })

    describe('getAudioFeatures', () => {
        it('returns audio features on successful response', async () => {
            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => ({
                    energy: 0.8,
                    valence: 0.75,
                    danceability: 0.65,
                    tempo: 120,
                    acousticness: 0.1,
                }),
            })

            const result = await getAudioFeatures('test-token', 'track-123')

            expect(result).toEqual({
                energy: 0.8,
                valence: 0.75,
                danceability: 0.65,
                tempo: 120,
                acousticness: 0.1,
            })
        })

        it('uses default values for missing optional properties', async () => {
            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => ({
                    energy: 0.8,
                    valence: 0.75,
                }),
            })

            const result = await getAudioFeatures('test-token', 'track-123')

            expect(result).toEqual({
                energy: 0.8,
                valence: 0.75,
                danceability: 0,
                tempo: 0,
                acousticness: 0,
            })
        })

        it('returns null when response is not ok', async () => {
            fetchMock.mockResolvedValue({ ok: false })

            const result = await getAudioFeatures('test-token', 'track-123')

            expect(result).toBeNull()
        })

        it('returns null when json parsing fails', async () => {
            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => {
                    throw new Error('JSON parse error')
                },
            })

            const result = await getAudioFeatures('test-token', 'track-123')

            expect(result).toBeNull()
        })

        it('returns null when energy is missing', async () => {
            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => ({ valence: 0.75, danceability: 0.65 }),
            })

            const result = await getAudioFeatures('test-token', 'track-123')

            expect(result).toBeNull()
        })

        it('returns null when valence is not a number', async () => {
            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => ({ energy: 0.8, valence: 'high' }),
            })

            const result = await getAudioFeatures('test-token', 'track-123')

            expect(result).toBeNull()
        })

        it('catches and returns null on fetch error', async () => {
            fetchMock.mockRejectedValue(new Error('Network error'))

            const result = await getAudioFeatures('test-token', 'track-123')

            expect(result).toBeNull()
        })
    })

    describe('searchSpotifyTrack', () => {
        it('returns track id on successful search', async () => {
            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => ({
                    tracks: { items: [{ id: 'spotify:track:abc123' }] },
                }),
            })

            const result = await searchSpotifyTrack(
                'test-token',
                'Song Title',
                'Artist Name',
            )

            expect(result).toBe('spotify:track:abc123')
        })

        it('returns null when no tracks found', async () => {
            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => ({ tracks: { items: [] } }),
            })

            const result = await searchSpotifyTrack(
                'test-token',
                'Unknown Song',
                'Unknown Artist',
            )

            expect(result).toBeNull()
        })

        it('returns null when tracks property is missing', async () => {
            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => ({}),
            })

            const result = await searchSpotifyTrack(
                'test-token',
                'Song',
                'Artist',
            )

            expect(result).toBeNull()
        })

        it('returns null when response is not ok', async () => {
            fetchMock.mockResolvedValue({ ok: false })

            const result = await searchSpotifyTrack(
                'test-token',
                'Song',
                'Artist',
            )

            expect(result).toBeNull()
        })

        it('returns null when json parsing fails', async () => {
            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => {
                    throw new Error('JSON parse error')
                },
            })

            const result = await searchSpotifyTrack(
                'test-token',
                'Song',
                'Artist',
            )

            expect(result).toBeNull()
        })

        it('catches and returns null on fetch error', async () => {
            fetchMock.mockRejectedValue(new Error('Network error'))

            const result = await searchSpotifyTrack(
                'test-token',
                'Song',
                'Artist',
            )

            expect(result).toBeNull()
        })
    })

    describe('getBatchAudioFeatures', () => {
        it('returns empty map for empty ids array', async () => {
            const result = await getBatchAudioFeatures('token', [])
            expect(result.size).toBe(0)
        })

        it('fetches audio features for multiple tracks', async () => {
            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => ({
                    audio_features: [
                        {
                            id: 'track1',
                            energy: 0.8,
                            valence: 0.7,
                            danceability: 0.6,
                            tempo: 120,
                            acousticness: 0.1,
                        },
                        {
                            id: 'track2',
                            energy: 0.5,
                            valence: 0.6,
                            danceability: 0.7,
                            tempo: 100,
                            acousticness: 0.3,
                        },
                    ],
                }),
            })

            const result = await getBatchAudioFeatures('token', [
                'track1',
                'track2',
            ])

            expect(result.size).toBe(2)
            expect(result.get('track1')).toEqual({
                energy: 0.8,
                valence: 0.7,
                danceability: 0.6,
                tempo: 120,
                acousticness: 0.1,
            })
            expect(result.get('track2')).toEqual({
                energy: 0.5,
                valence: 0.6,
                danceability: 0.7,
                tempo: 100,
                acousticness: 0.3,
            })
        })

        it('skips null entries in audio_features array', async () => {
            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => ({
                    audio_features: [
                        {
                            id: 'track1',
                            energy: 0.8,
                            valence: 0.7,
                            danceability: 0.6,
                            tempo: 120,
                            acousticness: 0.1,
                        },
                        null,
                        {
                            id: 'track3',
                            energy: 0.5,
                            valence: 0.6,
                            danceability: 0.7,
                            tempo: 100,
                            acousticness: 0.3,
                        },
                    ],
                }),
            })

            const result = await getBatchAudioFeatures('token', [
                'track1',
                'invalid',
                'track3',
            ])

            expect(result.size).toBe(2)
            expect(result.has('track1')).toBe(true)
            expect(result.has('track3')).toBe(true)
        })

        it('returns empty map on fetch error', async () => {
            fetchMock.mockResolvedValue({ ok: false })

            const result = await getBatchAudioFeatures('token', ['track1'])
            expect(result.size).toBe(0)
        })

        it('returns empty map on json parse error', async () => {
            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => {
                    throw new Error('JSON error')
                },
            })

            const result = await getBatchAudioFeatures('token', ['track1'])
            expect(result.size).toBe(0)
        })

        it('handles missing optional audio feature fields', async () => {
            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => ({
                    audio_features: [
                        { id: 'track1', energy: 0.8, valence: 0.7 },
                    ],
                }),
            })

            const result = await getBatchAudioFeatures('token', ['track1'])
            expect(result.get('track1')).toEqual({
                energy: 0.8,
                valence: 0.7,
                danceability: 0,
                tempo: 0,
                acousticness: 0,
            })
        })
    })

    describe('getArtistPopularity', () => {
        it('returns artist popularity from search', async () => {
            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => ({
                    artists: { items: [{ popularity: 75 }] },
                }),
            })

            const result = await getArtistPopularity('token', 'The Beatles')
            expect(result).toBe(75)
        })

        it('returns null when no artists found', async () => {
            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => ({ artists: { items: [] } }),
            })

            const result = await getArtistPopularity('token', 'Unknown Artist')
            expect(result).toBeNull()
        })

        it('returns null when response is not ok', async () => {
            fetchMock.mockResolvedValue({ ok: false })

            const result = await getArtistPopularity('token', 'Some Artist')
            expect(result).toBeNull()
        })

        it('returns null on fetch error', async () => {
            fetchMock.mockRejectedValue(new Error('Network error'))

            const result = await getArtistPopularity('token', 'Some Artist')
            expect(result).toBeNull()
        })

        it('returns null on json parse error', async () => {
            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => {
                    throw new Error('JSON error')
                },
            })

            const result = await getArtistPopularity('token', 'Some Artist')
            expect(result).toBeNull()
        })
    })

    describe('getSpotifyRecommendations', () => {
        it('returns empty array when seedTrackIds is empty', async () => {
            const result = await getSpotifyRecommendations('token', [])
            expect(result).toEqual([])
            expect(fetchMock).not.toHaveBeenCalled()
        })

        it('returns tracks on successful response', async () => {
            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => ({
                    tracks: [
                        {
                            id: 'rec1',
                            name: 'Recommended Track',
                            artists: [{ name: 'Artist A' }],
                            duration_ms: 200000,
                        },
                        {
                            id: 'rec2',
                            name: 'Another Track',
                            artists: [
                                { name: 'Artist B' },
                                { name: 'Artist C' },
                            ],
                            duration_ms: 180000,
                        },
                    ],
                }),
            })

            const result = await getSpotifyRecommendations(
                'token',
                ['seed1', 'seed2'],
                10,
            )

            expect(result).toHaveLength(2)
            expect(result[0]).toEqual({
                id: 'rec1',
                name: 'Recommended Track',
                artists: [{ name: 'Artist A' }],
                duration_ms: 200000,
            })
            expect(result[1].artists).toHaveLength(2)
        })

        it('slices seed track ids to max 5', async () => {
            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => ({ tracks: [] }),
            })

            await getSpotifyRecommendations('token', [
                'a',
                'b',
                'c',
                'd',
                'e',
                'f',
                'g',
            ])

            const url = fetchMock.mock.calls[0]?.[0] as string
            const params = new URLSearchParams(url.split('?')[1])
            expect(params.get('seed_tracks')?.split(',').length).toBe(5)
        })

        it('returns empty array when response is not ok', async () => {
            fetchMock.mockResolvedValue({ ok: false })
            const result = await getSpotifyRecommendations('token', ['seed1'])
            expect(result).toEqual([])
        })

        it('returns empty array on network error', async () => {
            fetchMock.mockRejectedValue(new Error('network error'))
            const result = await getSpotifyRecommendations('token', ['seed1'])
            expect(result).toEqual([])
        })

        it('filters out tracks missing id or name', async () => {
            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => ({
                    tracks: [
                        {
                            id: 'good',
                            name: 'Good Track',
                            artists: [],
                            duration_ms: 200000,
                        },
                        {
                            id: null,
                            name: 'No ID',
                            artists: [],
                            duration_ms: 100000,
                        },
                        {
                            id: 'noid2',
                            name: null,
                            artists: [],
                            duration_ms: 100000,
                        },
                    ],
                }),
            })

            const result = await getSpotifyRecommendations('token', ['seed1'])
            expect(result).toHaveLength(1)
            expect(result[0].id).toBe('good')
        })

        it('passes audio feature constraints as URL parameters when provided', async () => {
            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => ({ tracks: [] }),
            })

            await getSpotifyRecommendations('token', ['seed1'], 10, {
                energy: 0.8,
                valence: 0.6,
                danceability: 0.75,
            })

            const call = fetchMock.mock.calls[0]!
            const url = String(call[0])
            expect(url).toContain('min_energy=0.55')
            expect(url).toContain('max_energy=1.00')
            expect(url).toContain('min_valence=0.35')
            expect(url).toContain('max_valence=0.85')
            expect(url).toContain('min_danceability=0.50')
            expect(url).toContain('max_danceability=1.00')
        })

        it('does not pass audio feature constraints when audioConstraints is undefined', async () => {
            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => ({ tracks: [] }),
            })

            await getSpotifyRecommendations('token', ['seed1'], 10, undefined)

            const call = fetchMock.mock.calls[0]!
            const url = String(call[0])
            expect(url).not.toContain('min_energy')
            expect(url).not.toContain('min_valence')
            expect(url).not.toContain('min_danceability')
        })

        it('clamps audio constraint bounds to [0, 1]', async () => {
            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => ({ tracks: [] }),
            })

            await getSpotifyRecommendations('token', ['seed1'], 10, {
                energy: 0.1,
                valence: 0.95,
            })

            const call = fetchMock.mock.calls[0]!
            const url = String(call[0])
            expect(url).toContain('min_energy=0.00')
            expect(url).toContain('max_energy=0.35')
            expect(url).toContain('min_valence=0.70')
            expect(url).toContain('max_valence=1.00')
        })
    })
})

    describe('getArtistGenres', () => {
        it('returns empty array when response not ok', async () => {
            fetchMock.mockResolvedValue({ ok: false })
            expect(await getArtistGenres('token', 'Artist')).toEqual([])
        })

        it('returns empty array on network error', async () => {
            fetchMock.mockRejectedValue(new Error('Network'))
            expect(await getArtistGenres('token', 'Artist')).toEqual([])
        })

        it('returns empty array when no artists found', async () => {
            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => ({ artists: { items: [] } }),
            })
            expect(await getArtistGenres('token', 'UnknownArtist')).toEqual([])
        })

        it('returns empty array on JSON parse error', async () => {
            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => { throw new Error('Parse error') },
            })
            expect(await getArtistGenres('token', 'Artist')).toEqual([])
        })

        it('handles missing genres field', async () => {
            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => ({
                    artists: { items: [{ name: 'Artist' }] },
                }),
            })
            expect(await getArtistGenres('token', 'Artist')).toEqual([])
        })

        it('handles null genres', async () => {
            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => ({
                    artists: { items: [{ genres: null }] },
                }),
            })
            expect(await getArtistGenres('token', 'Artist')).toEqual([])
        })

        it('handles undefined artists', async () => {
            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => ({ artists: undefined }),
            })
            expect(await getArtistGenres('token', 'Artist')).toEqual([])
        })
    })

    describe('getUserTopArtistsAndTracks', () => {
        it('returns null on 401 unauthorized', async () => {
            fetchMock.mockResolvedValue({ ok: false })

            const result = await getUserTopArtistsAndTracks('expired-token')

            expect(result).toBeNull()
        })

        it('returns null on 429 rate limit', async () => {
            fetchMock.mockResolvedValue({ ok: false })

            const result = await getUserTopArtistsAndTracks('test-token')

            expect(result).toBeNull()
        })

        it('returns null on network error', async () => {
            fetchMock.mockRejectedValue(new Error('Network error'))

            const result = await getUserTopArtistsAndTracks('test-token')

            expect(result).toBeNull()
        })

        it('returns null when artists response is not ok', async () => {
            fetchMock.mockResolvedValue({ ok: false })

            const result = await getUserTopArtistsAndTracks('test-token')

            expect(result).toBeNull()
        })

        it('returns null on malformed JSON response', async () => {
            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => {
                    throw new Error('JSON parse error')
                },
            })

            const result = await getUserTopArtistsAndTracks('test-token')

            expect(result).toBeNull()
        })
    })
}
