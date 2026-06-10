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
    getUserSavedTracks,
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

    describe('request timeout (#1279)', () => {
        it('passes an AbortSignal deadline to the Spotify fetch', async () => {
            fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) })
            await getAudioFeatures('test-token', 'track-1')
            expect(fetchMock).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({ signal: expect.any(AbortSignal) }),
            )
        })

        it('surfaces a timeout as the normal error fallback without a 429 retry', async () => {
            fetchMock.mockRejectedValue(
                new DOMException('The operation timed out', 'TimeoutError'),
            )
            const result = await getAudioFeatures('test-token', 'track-1')
            expect(result).toBeNull()
            expect(fetchMock).toHaveBeenCalledTimes(1)
        })
    })

    describe('getAudioFeatures', () => {
        it.each([
            [
                'success',
                async () => {
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
                    const result = await getAudioFeatures(
                        'test-token',
                        'track-123',
                    )
                    expect(result).toEqual({
                        energy: 0.8,
                        valence: 0.75,
                        danceability: 0.65,
                        tempo: 120,
                        acousticness: 0.1,
                    })
                },
            ],
            [
                'success with defaults',
                async () => {
                    fetchMock.mockResolvedValue({
                        ok: true,
                        json: async () => ({ energy: 0.8, valence: 0.75 }),
                    })
                    const result = await getAudioFeatures(
                        'test-token',
                        'track-456',
                    )
                    expect(result).toEqual({
                        energy: 0.8,
                        valence: 0.75,
                        danceability: 0,
                        tempo: 0,
                        acousticness: 0,
                    })
                },
            ],
            [
                'error cases',
                async () => {
                    fetchMock.mockResolvedValue({ ok: false })
                    let result = await getAudioFeatures(
                        'test-token',
                        'track-123',
                    )
                    expect(result).toBeNull()
                    fetchMock.mockResolvedValue({
                        ok: true,
                        json: async () => {
                            throw new Error('JSON parse error')
                        },
                    })
                    result = await getAudioFeatures('test-token', 'track-123')
                    expect(result).toBeNull()
                    fetchMock.mockResolvedValue({
                        ok: true,
                        json: async () => ({
                            valence: 0.75,
                            danceability: 0.65,
                        }),
                    })
                    result = await getAudioFeatures('test-token', 'track-123')
                    expect(result).toBeNull()
                    fetchMock.mockResolvedValue({
                        ok: true,
                        json: async () => ({ energy: 0.8, valence: 'high' }),
                    })
                    result = await getAudioFeatures('test-token', 'track-123')
                    expect(result).toBeNull()
                    fetchMock.mockRejectedValue(new Error('Network error'))
                    result = await getAudioFeatures('test-token', 'track-123')
                    expect(result).toBeNull()
                },
            ],
        ])('%s', async (_label, test) => {
            await test()
        })
    })

    describe('searchSpotifyTrack', () => {
        it.each([
            [
                'success',
                async () => {
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
                },
            ],
            [
                'error cases',
                async () => {
                    fetchMock.mockResolvedValue({
                        ok: true,
                        json: async () => ({ tracks: { items: [] } }),
                    })
                    let result = await searchSpotifyTrack(
                        'test-token',
                        'Unknown Song',
                        'Unknown Artist',
                    )
                    expect(result).toBeNull()
                    fetchMock.mockResolvedValue({
                        ok: true,
                        json: async () => ({}),
                    })
                    result = await searchSpotifyTrack(
                        'test-token',
                        'Song',
                        'Artist',
                    )
                    expect(result).toBeNull()
                    fetchMock.mockResolvedValue({ ok: false })
                    result = await searchSpotifyTrack(
                        'test-token',
                        'Song',
                        'Artist',
                    )
                    expect(result).toBeNull()
                    fetchMock.mockResolvedValue({
                        ok: true,
                        json: async () => {
                            throw new Error('JSON parse error')
                        },
                    })
                    result = await searchSpotifyTrack(
                        'test-token',
                        'Song',
                        'Artist',
                    )
                    expect(result).toBeNull()
                    fetchMock.mockRejectedValue(new Error('Network error'))
                    result = await searchSpotifyTrack(
                        'test-token',
                        'Song',
                        'Artist',
                    )
                    expect(result).toBeNull()
                },
            ],
        ])('%s', async (_label, test) => {
            await test()
        })
    })

    describe('getBatchAudioFeatures', () => {
        it.each([
            [
                'empty array',
                async () => {
                    const result = await getBatchAudioFeatures('token', [])
                    expect(result.size).toBe(0)
                },
            ],
            [
                'success',
                async () => {
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
                                { id: 'track3', energy: 0.5, valence: 0.6 },
                            ],
                        }),
                    })
                    const result = await getBatchAudioFeatures('token', [
                        'track1',
                        'invalid',
                        'track3',
                    ])
                    expect(result.size).toBe(2)
                    expect(result.get('track1')).toEqual({
                        energy: 0.8,
                        valence: 0.7,
                        danceability: 0.6,
                        tempo: 120,
                        acousticness: 0.1,
                    })
                    expect(result.get('track3')).toEqual({
                        energy: 0.5,
                        valence: 0.6,
                        danceability: 0,
                        tempo: 0,
                        acousticness: 0,
                    })
                },
            ],
            [
                'fetch error',
                async () => {
                    fetchMock.mockResolvedValue({ ok: false })
                    const result = await getBatchAudioFeatures('token', [
                        'track1',
                    ])
                    expect(result.size).toBe(0)
                },
            ],
            [
                'json parse error',
                async () => {
                    fetchMock.mockResolvedValue({
                        ok: true,
                        json: async () => {
                            throw new Error('JSON error')
                        },
                    })
                    const result = await getBatchAudioFeatures('token', [
                        'track1',
                    ])
                    expect(result.size).toBe(0)
                },
            ],
        ])('%s', async (_label, test) => {
            await test()
        })
    })

    describe('getArtistPopularity', () => {
        it.each([
            [
                'success',
                async () => {
                    fetchMock.mockResolvedValue({
                        ok: true,
                        json: async () => ({
                            artists: { items: [{ popularity: 75 }] },
                        }),
                    })
                    const result = await getArtistPopularity(
                        'token',
                        'The Beatles',
                    )
                    expect(result).toBe(75)
                },
            ],
            [
                'error cases',
                async () => {
                    fetchMock.mockResolvedValue({
                        ok: true,
                        json: async () => ({ artists: { items: [] } }),
                    })
                    let result = await getArtistPopularity(
                        'token',
                        'Unknown Artist',
                    )
                    expect(result).toBeNull()
                    fetchMock.mockResolvedValue({ ok: false })
                    result = await getArtistPopularity('token', 'Some Artist')
                    expect(result).toBeNull()
                    fetchMock.mockRejectedValue(new Error('Network error'))
                    result = await getArtistPopularity('token', 'Some Artist')
                    expect(result).toBeNull()
                    fetchMock.mockResolvedValue({
                        ok: true,
                        json: async () => {
                            throw new Error('JSON error')
                        },
                    })
                    result = await getArtistPopularity('token', 'Some Artist')
                    expect(result).toBeNull()
                },
            ],
        ])('%s', async (_label, test) => {
            await test()
        })
    })

    describe('getArtistGenres', () => {
        it('returns genres from first artist', async () => {
            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => ({
                    artists: { items: [{ genres: ['rock', 'pop'] }] },
                }),
            })
            expect(await getArtistGenres('token', 'The Beatles')).toEqual([
                'rock',
                'pop',
            ])
        })

        it.each([
            [
                'non-ok response',
                async () => {
                    fetchMock.mockResolvedValue({ ok: false })
                    expect(await getArtistGenres('token', 'Artist')).toEqual([])
                },
            ],
            [
                'error cases',
                async () => {
                    fetchMock.mockRejectedValue(new Error('Network'))
                    let result = await getArtistGenres('token', 'Artist')
                    expect(result).toEqual([])
                    fetchMock.mockResolvedValue({
                        ok: true,
                        json: async () => ({ artists: { items: [] } }),
                    })
                    result = await getArtistGenres('token', 'UnknownArtist')
                    expect(result).toEqual([])
                    fetchMock.mockResolvedValue({
                        ok: true,
                        json: async () => {
                            throw new Error('Parse error')
                        },
                    })
                    result = await getArtistGenres('token', 'Artist')
                    expect(result).toEqual([])
                    fetchMock.mockResolvedValue({
                        ok: true,
                        json: async () => ({
                            artists: { items: [{ name: 'Artist' }] },
                        }),
                    })
                    result = await getArtistGenres('token', 'Artist')
                    expect(result).toEqual([])
                    fetchMock.mockResolvedValue({
                        ok: true,
                        json: async () => ({
                            artists: { items: [{ genres: null }] },
                        }),
                    })
                    result = await getArtistGenres('token', 'Artist')
                    expect(result).toEqual([])
                    fetchMock.mockResolvedValue({
                        ok: true,
                        json: async () => ({ artists: undefined }),
                    })
                    result = await getArtistGenres('token', 'Artist')
                    expect(result).toEqual([])
                },
            ],
        ])('%s', async (_label, test) => {
            await test()
        })
    })

    describe('getSpotifyRecommendations', () => {
        it('returns empty array when empty seeds; returns filtered tracks with constraints applied; slices seeds to max 5', async () => {
            let result = await getSpotifyRecommendations('token', [])
            expect(result).toEqual([])
            expect(fetchMock).not.toHaveBeenCalled()

            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => ({
                    tracks: [
                        {
                            id: 'good',
                            name: 'Good Track',
                            artists: [{ name: 'Artist A' }],
                            duration_ms: 200000,
                        },
                        {
                            id: null,
                            name: 'No ID',
                            artists: [],
                            duration_ms: 100000,
                        },
                        {
                            id: 'valid2',
                            name: null,
                            artists: [{ name: 'Artist B' }],
                            duration_ms: 180000,
                        },
                    ],
                }),
            })

            result = await getSpotifyRecommendations('token', ['seed1'], 10, {
                energy: 0.8,
                valence: 0.6,
                danceability: 0.75,
            })
            expect(result).toHaveLength(1)
            expect(result[0].id).toBe('good')
            let url = String(fetchMock.mock.calls[0]![0])
            expect(url).toContain('min_energy=0.55')
            expect(url).toContain('max_danceability=1.00')

            jest.clearAllMocks()
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
            url = String(fetchMock.mock.calls[0]![0])
            let params = new URLSearchParams(url.split('?')[1])
            expect(params.get('seed_tracks')?.split(',').length).toBe(5)
        })

        it('does not add constraint params when undefined; clamps constraint bounds to [0,1]', async () => {
            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => ({ tracks: [] }),
            })

            await getSpotifyRecommendations('token', ['seed1'], 10, undefined)
            let url = String(fetchMock.mock.calls[0]![0])
            expect(url).not.toContain('min_energy')

            jest.clearAllMocks()
            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => ({ tracks: [] }),
            })

            await getSpotifyRecommendations('token', ['seed1'], 10, {
                energy: 0.1,
                valence: 0.95,
            })
            url = String(fetchMock.mock.calls[0]![0])
            expect(url).toContain('min_energy=0.00')
            expect(url).toContain('max_energy=0.35')
            expect(url).toContain('min_valence=0.70')
        })

        it.each([
            [
                'error cases',
                async () => {
                    fetchMock.mockResolvedValue({ ok: false })
                    let result = await getSpotifyRecommendations('token', [
                        'seed1',
                    ])
                    expect(result).toEqual([])
                    fetchMock.mockRejectedValue(new Error('network error'))
                    result = await getSpotifyRecommendations('token', ['seed1'])
                    expect(result).toEqual([])
                },
            ],
        ])('returns empty array on %s', async (_label, test) => {
            await test()
        })
    })

    describe('getUserTopArtistsAndTracks', () => {
        it.each([
            [
                'success',
                async () => {
                    let callCount = 0
                    fetchMock.mockImplementation(async () => {
                        callCount++
                        if (callCount === 1)
                            return {
                                ok: true,
                                json: () =>
                                    Promise.resolve({
                                        items: [
                                            {
                                                id: 'a1',
                                                name: 'Artist 1',
                                                genres: ['rock', 'pop'],
                                            },
                                            { id: 'a2', name: 'Artist 2' },
                                            {
                                                id: 'a3',
                                                name: 'Artist 3',
                                                genres: null,
                                            },
                                            { id: '', name: 'No Id' },
                                            { id: 'a5' },
                                        ],
                                    }),
                            }
                        return {
                            ok: true,
                            json: () =>
                                Promise.resolve({
                                    items: [
                                        {
                                            id: 't1',
                                            name: 'Track 1',
                                            artists: [{ name: 'Main' }],
                                        },
                                        { id: 't2', name: 'Track 2' },
                                        {
                                            id: 't3',
                                            name: 'Track 3',
                                            artists: [],
                                        },
                                        {
                                            id: 't4',
                                            name: 'Track 4',
                                            artists: [{}],
                                        },
                                        { name: 'No Id Track' },
                                    ],
                                }),
                        }
                    })
                    const result = await getUserTopArtistsAndTracks('token')
                    expect(result?.artists).toHaveLength(3)
                    expect(result?.artists[0].genres).toEqual(['rock', 'pop'])
                    expect(result?.tracks).toHaveLength(4)
                    expect(result?.tracks[0].artist).toBe('Main')
                },
            ],
            [
                'error cases',
                async () => {
                    fetchMock.mockResolvedValue({ ok: false })
                    let result =
                        await getUserTopArtistsAndTracks('expired-token')
                    expect(result).toBeNull()
                    fetchMock.mockRejectedValue(new Error('Network error'))
                    result = await getUserTopArtistsAndTracks('test-token')
                    expect(result).toBeNull()
                    fetchMock.mockResolvedValue({
                        ok: true,
                        json: async () => {
                            throw new Error('JSON parse error')
                        },
                    })
                    result = await getUserTopArtistsAndTracks('test-token')
                    expect(result).toBeNull()
                    fetchMock
                        .mockResolvedValueOnce({ ok: false })
                        .mockResolvedValueOnce({
                            ok: true,
                            json: async () => ({ items: [] }),
                        })
                    result = await getUserTopArtistsAndTracks('token')
                    expect(result).toBeNull()
                    fetchMock
                        .mockResolvedValueOnce({
                            ok: true,
                            json: async () => ({ items: [] }),
                        })
                        .mockResolvedValueOnce({ ok: false })
                    result = await getUserTopArtistsAndTracks('token')
                    expect(result).toBeNull()
                    fetchMock
                        .mockResolvedValueOnce({
                            ok: true,
                            json: () => Promise.resolve(null),
                        })
                        .mockResolvedValueOnce({
                            ok: true,
                            json: () => Promise.resolve({ items: [] }),
                        })
                    result = await getUserTopArtistsAndTracks('token')
                    expect(result).toBeNull()
                },
            ],
        ])('%s', async (_label, test) => {
            await test()
        })
    })

    describe('getUserSavedTracks', () => {
        it('returns track ids; paginates; stops at 200; skips invalid items; breaks on non-ok response', async () => {
            let callCount = 0
            fetchMock.mockImplementation(async () => {
                callCount++
                if (callCount <= 4) {
                    return {
                        ok: true,
                        json: async () => ({
                            items: Array.from({ length: 50 }, (_, i) => ({
                                track: { id: `t${(callCount - 1) * 50 + i}` },
                            })),
                            total: 1000,
                        }),
                    }
                }
                return {
                    ok: true,
                    json: async () => ({ items: [], total: 1000 }),
                }
            })

            let result = await getUserSavedTracks('token')
            expect(result.length).toBeLessThanOrEqual(200)
            expect(fetchMock).toHaveBeenCalledTimes(4)

            jest.clearAllMocks()
            fetchMock
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({
                        items: [
                            { track: { id: 'valid-1' } },
                            { track: {} },
                            { track: null },
                            {},
                            { track: { id: 'valid-2' } },
                        ],
                        total: 5,
                    }),
                })
                .mockResolvedValue({
                    ok: true,
                    json: async () => ({ items: [], total: 5 }),
                })

            result = await getUserSavedTracks('token')
            expect(result).toEqual(['valid-1', 'valid-2'])

            jest.clearAllMocks()
            let callCount2 = 0
            fetchMock.mockImplementation(async () => {
                callCount2++
                if (callCount2 === 1) {
                    return {
                        ok: true,
                        json: async () => ({
                            items: [{ track: { id: 'track-1' } }],
                            total: 100,
                        }),
                    }
                }
                return { ok: false, json: async () => ({}) }
            })

            result = await getUserSavedTracks('token')
            expect(result).toEqual(['track-1'])
        })

        it('stops when items array is empty', async () => {
            fetchMock.mockResolvedValue({
                ok: true,
                json: async () => ({ items: [], total: 100 }),
            })

            const result = await getUserSavedTracks('token')
            expect(result).toEqual([])
            expect(fetchMock).toHaveBeenCalledTimes(1)
        })

        it.each([
            [
                'error cases',
                async () => {
                    fetchMock.mockResolvedValue({
                        ok: true,
                        json: async () => {
                            throw new Error('JSON error')
                        },
                    })
                    let result = await getUserSavedTracks('token')
                    expect(result).toEqual([])
                    fetchMock.mockRejectedValue(new Error('network error'))
                    result = await getUserSavedTracks('token')
                    expect(result).toEqual([])
                },
            ],
        ])('returns empty array on %s', async (_label, test) => {
            await test()
        })
    })
})
