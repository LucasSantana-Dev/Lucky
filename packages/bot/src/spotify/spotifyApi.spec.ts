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

// Common mock recipes — used as it.each rows so each "returns null/empty on X"
// branch ends up as one row instead of a near-identical it() block.
const okWithJson = (json: () => Promise<unknown>): MockFetchResponse => ({
    ok: true,
    json,
})
const notOk = (): MockFetchResponse => ({ ok: false })
const jsonParseFail = (): MockFetchResponse => ({
    ok: true,
    json: async () => {
        throw new Error('JSON parse error')
    },
})

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
            fetchMock.mockResolvedValue(
                okWithJson(async () => ({
                    energy: 0.8,
                    valence: 0.75,
                    danceability: 0.65,
                    tempo: 120,
                    acousticness: 0.1,
                })),
            )

            expect(await getAudioFeatures('test-token', 'track-123')).toEqual({
                energy: 0.8,
                valence: 0.75,
                danceability: 0.65,
                tempo: 120,
                acousticness: 0.1,
            })
        })

        it('uses default values for missing optional properties', async () => {
            fetchMock.mockResolvedValue(
                okWithJson(async () => ({ energy: 0.8, valence: 0.75 })),
            )

            expect(await getAudioFeatures('test-token', 'track-123')).toEqual({
                energy: 0.8,
                valence: 0.75,
                danceability: 0,
                tempo: 0,
                acousticness: 0,
            })
        })

        // Each row covers one distinct null-return branch (HTTP, JSON parse,
        // type-guard on energy, type-guard on valence, outer catch).
        it.each([
            ['response not ok', () => fetchMock.mockResolvedValue(notOk())],
            ['json parse fails', () => fetchMock.mockResolvedValue(jsonParseFail())],
            [
                'energy is missing',
                () =>
                    fetchMock.mockResolvedValue(
                        okWithJson(async () => ({
                            valence: 0.75,
                            danceability: 0.65,
                        })),
                    ),
            ],
            [
                'valence is not a number',
                () =>
                    fetchMock.mockResolvedValue(
                        okWithJson(async () => ({ energy: 0.8, valence: 'high' })),
                    ),
            ],
            [
                'fetch rejects',
                () => fetchMock.mockRejectedValue(new Error('Network error')),
            ],
        ])('returns null when %s', async (_label, arrange) => {
            arrange()
            expect(await getAudioFeatures('test-token', 'track-123')).toBeNull()
        })
    })

    describe('searchSpotifyTrack', () => {
        it('returns track id on successful search', async () => {
            fetchMock.mockResolvedValue(
                okWithJson(async () => ({
                    tracks: { items: [{ id: 'spotify:track:abc123' }] },
                })),
            )

            expect(
                await searchSpotifyTrack('test-token', 'Song Title', 'Artist Name'),
            ).toBe('spotify:track:abc123')
        })

        it.each([
            [
                'no tracks found',
                () =>
                    fetchMock.mockResolvedValue(
                        okWithJson(async () => ({ tracks: { items: [] } })),
                    ),
            ],
            [
                'tracks property is missing',
                () => fetchMock.mockResolvedValue(okWithJson(async () => ({}))),
            ],
            ['response not ok', () => fetchMock.mockResolvedValue(notOk())],
            ['json parse fails', () => fetchMock.mockResolvedValue(jsonParseFail())],
            [
                'fetch rejects',
                () => fetchMock.mockRejectedValue(new Error('Network error')),
            ],
        ])('returns null when %s', async (_label, arrange) => {
            arrange()
            expect(
                await searchSpotifyTrack('test-token', 'Song', 'Artist'),
            ).toBeNull()
        })
    })

    describe('getBatchAudioFeatures', () => {
        it('returns empty map for empty ids array', async () => {
            const result = await getBatchAudioFeatures('token', [])
            expect(result.size).toBe(0)
        })

        it('fetches audio features for multiple tracks', async () => {
            fetchMock.mockResolvedValue(
                okWithJson(async () => ({
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
                })),
            )

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
            fetchMock.mockResolvedValue(
                okWithJson(async () => ({
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
                })),
            )

            const result = await getBatchAudioFeatures('token', [
                'track1',
                'invalid',
                'track3',
            ])

            expect(result.size).toBe(2)
            expect(result.has('track1')).toBe(true)
            expect(result.has('track3')).toBe(true)
        })

        it.each([
            ['response not ok', () => fetchMock.mockResolvedValue(notOk())],
            ['json parse fails', () => fetchMock.mockResolvedValue(jsonParseFail())],
        ])('returns empty map when %s', async (_label, arrange) => {
            arrange()
            const result = await getBatchAudioFeatures('token', ['track1'])
            expect(result.size).toBe(0)
        })

        it('handles missing optional audio feature fields', async () => {
            fetchMock.mockResolvedValue(
                okWithJson(async () => ({
                    audio_features: [
                        { id: 'track1', energy: 0.8, valence: 0.7 },
                    ],
                })),
            )

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
            fetchMock.mockResolvedValue(
                okWithJson(async () => ({
                    artists: { items: [{ popularity: 75 }] },
                })),
            )

            expect(await getArtistPopularity('token', 'The Beatles')).toBe(75)
        })

        it.each([
            [
                'no artists found',
                () =>
                    fetchMock.mockResolvedValue(
                        okWithJson(async () => ({ artists: { items: [] } })),
                    ),
            ],
            ['response not ok', () => fetchMock.mockResolvedValue(notOk())],
            [
                'fetch rejects',
                () => fetchMock.mockRejectedValue(new Error('Network error')),
            ],
            ['json parse fails', () => fetchMock.mockResolvedValue(jsonParseFail())],
        ])('returns null when %s', async (_label, arrange) => {
            arrange()
            expect(await getArtistPopularity('token', 'Some Artist')).toBeNull()
        })
    })

    describe('getSpotifyRecommendations', () => {
        it('returns empty array when seedTrackIds is empty', async () => {
            const result = await getSpotifyRecommendations('token', [])
            expect(result).toEqual([])
            expect(fetchMock).not.toHaveBeenCalled()
        })

        it('returns tracks on successful response', async () => {
            fetchMock.mockResolvedValue(
                okWithJson(async () => ({
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
                })),
            )

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
            fetchMock.mockResolvedValue(okWithJson(async () => ({ tracks: [] })))

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

        it.each([
            ['response not ok', () => fetchMock.mockResolvedValue(notOk())],
            [
                'fetch rejects',
                () => fetchMock.mockRejectedValue(new Error('network error')),
            ],
        ])('returns empty array when %s', async (_label, arrange) => {
            arrange()
            const result = await getSpotifyRecommendations('token', ['seed1'])
            expect(result).toEqual([])
        })

        it('filters out tracks missing id or name', async () => {
            fetchMock.mockResolvedValue(
                okWithJson(async () => ({
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
                })),
            )

            const result = await getSpotifyRecommendations('token', ['seed1'])
            expect(result).toHaveLength(1)
            expect(result[0].id).toBe('good')
        })

        it('passes audio feature constraints as URL parameters when provided', async () => {
            fetchMock.mockResolvedValue(okWithJson(async () => ({ tracks: [] })))

            await getSpotifyRecommendations('token', ['seed1'], 10, {
                energy: 0.8,
                valence: 0.6,
                danceability: 0.75,
            })

            const url = String(fetchMock.mock.calls[0]![0])
            expect(url).toContain('min_energy=0.55')
            expect(url).toContain('max_energy=1.00')
            expect(url).toContain('min_valence=0.35')
            expect(url).toContain('max_valence=0.85')
            expect(url).toContain('min_danceability=0.50')
            expect(url).toContain('max_danceability=1.00')
        })

        it('does not pass audio feature constraints when audioConstraints is undefined', async () => {
            fetchMock.mockResolvedValue(okWithJson(async () => ({ tracks: [] })))

            await getSpotifyRecommendations('token', ['seed1'], 10, undefined)

            const url = String(fetchMock.mock.calls[0]![0])
            expect(url).not.toContain('min_energy')
            expect(url).not.toContain('min_valence')
            expect(url).not.toContain('min_danceability')
        })

        it('clamps audio constraint bounds to [0, 1]', async () => {
            fetchMock.mockResolvedValue(okWithJson(async () => ({ tracks: [] })))

            await getSpotifyRecommendations('token', ['seed1'], 10, {
                energy: 0.1,
                valence: 0.95,
            })

            const url = String(fetchMock.mock.calls[0]![0])
            expect(url).toContain('min_energy=0.00')
            expect(url).toContain('max_energy=0.35')
            expect(url).toContain('min_valence=0.70')
            expect(url).toContain('max_valence=1.00')
        })
    })

    describe('getArtistGenres', () => {
        // Each row hits a distinct empty-array branch:
        //   HTTP, network reject, empty items, JSON parse, missing field,
        //   null genres, undefined artists. All preserved.
        it.each([
            ['response not ok', () => fetchMock.mockResolvedValue(notOk())],
            [
                'fetch rejects',
                () => fetchMock.mockRejectedValue(new Error('Network')),
            ],
            [
                'no artists found',
                () =>
                    fetchMock.mockResolvedValue(
                        okWithJson(async () => ({ artists: { items: [] } })),
                    ),
            ],
            ['json parse fails', () => fetchMock.mockResolvedValue(jsonParseFail())],
            [
                'genres field missing',
                () =>
                    fetchMock.mockResolvedValue(
                        okWithJson(async () => ({
                            artists: { items: [{ name: 'Artist' }] },
                        })),
                    ),
            ],
            [
                'genres is null',
                () =>
                    fetchMock.mockResolvedValue(
                        okWithJson(async () => ({
                            artists: { items: [{ genres: null }] },
                        })),
                    ),
            ],
            [
                'artists is undefined',
                () =>
                    fetchMock.mockResolvedValue(
                        okWithJson(async () => ({ artists: undefined })),
                    ),
            ],
        ])('returns empty array when %s', async (_label, arrange) => {
            arrange()
            expect(await getArtistGenres('token', 'Artist')).toEqual([])
        })
    })

    describe('getUserTopArtistsAndTracks', () => {
        // The original suite had 3 separately-named tests ("401 unauthorized",
        // "429 rate limit", "artists response is not ok") that all mocked the
        // same `{ ok: false }` branch — folded into one.
        it.each([
            ['artists fetch returns ok:false', () => fetchMock.mockResolvedValue(notOk())],
            [
                'fetch rejects',
                () => fetchMock.mockRejectedValue(new Error('Network error')),
            ],
            ['json parse fails', () => fetchMock.mockResolvedValue(jsonParseFail())],
        ])('returns null when %s', async (_label, arrange) => {
            arrange()
            expect(await getUserTopArtistsAndTracks('test-token')).toBeNull()
        })

        it('returns null when artists json is null', async () => {
            let callCount = 0
            fetchMock.mockImplementation(async () => {
                callCount++
                if (callCount === 1) {
                    return { ok: true, json: () => Promise.resolve(null) }
                }
                return { ok: true, json: () => Promise.resolve({ items: [] }) }
            })

            expect(await getUserTopArtistsAndTracks('token')).toBeNull()
        })

        it.each([
            [
                'artists ok:false but tracks ok',
                () =>
                    fetchMock
                        .mockResolvedValueOnce(notOk())
                        .mockResolvedValueOnce(okWithJson(async () => ({ items: [] }))),
            ],
            [
                'artists ok but tracks ok:false',
                () =>
                    fetchMock
                        .mockResolvedValueOnce(okWithJson(async () => ({ items: [] })))
                        .mockResolvedValueOnce(notOk()),
            ],
        ])('returns null when %s', async (_label, arrange) => {
            arrange()
            expect(await getUserTopArtistsAndTracks('token')).toBeNull()
        })

        it('returns artists and tracks with valid response', async () => {
            let callCount = 0
            fetchMock.mockImplementation(async () => {
                callCount++
                if (callCount === 1) {
                    return okWithJson(async () => ({
                        items: [{ id: 'a1', name: 'Artist 1', genres: [] }],
                    }))
                }
                return okWithJson(async () => ({
                    items: [
                        { id: 't1', name: 'Track 1', artists: [{ name: 'Artist 1' }] },
                    ],
                }))
            })

            const result = await getUserTopArtistsAndTracks('token')

            expect(result).not.toBeNull()
            expect(result?.artists).toHaveLength(1)
            expect(result?.tracks).toHaveLength(1)
            expect(result?.artists[0].id).toBe('a1')
        })

        it('handles tracks without artist field', async () => {
            let callCount = 0
            fetchMock.mockImplementation(async () =>
                ++callCount === 1
                    ? okWithJson(async () => ({ items: [] }))
                    : okWithJson(async () => ({
                        items: [{ id: 't1', name: 'Track 1' }],
                    })),
            )

            const result = await getUserTopArtistsAndTracks('token')

            expect(result).not.toBeNull()
            expect(result?.tracks).toHaveLength(1)
            expect(result?.tracks[0].artist).toBe('Unknown')
        })

        it('builds full payload with mixed artist + track shapes', async () => {
            let callCount = 0
            fetchMock.mockImplementation(async () => {
                callCount++
                if (callCount === 1) {
                    return okWithJson(async () => ({
                        items: [
                            { id: 'a1', name: 'Artist 1', genres: ['rock', 'pop'] },
                            { id: 'a2', name: 'Artist 2' },
                            { id: 'a3', name: 'Artist 3', genres: null },
                            { id: '', name: 'No Id' },
                            { id: 'a5' },
                        ],
                    }))
                }
                return okWithJson(async () => ({
                    items: [
                        { id: 't1', name: 'Track 1', artists: [{ name: 'Main' }] },
                        { id: 't2', name: 'Track 2' },
                        { id: 't3', name: 'Track 3', artists: [] },
                        { id: 't4', name: 'Track 4', artists: [{}] },
                        { name: 'No Id Track' },
                    ],
                }))
            })

            const result = await getUserTopArtistsAndTracks('token')

            expect(result).not.toBeNull()
            expect(result?.artists).toHaveLength(3)
            expect(result?.artists[0]).toEqual({
                id: 'a1',
                name: 'Artist 1',
                genres: ['rock', 'pop'],
            })
            expect(result?.artists[1].genres).toEqual([])
            expect(result?.artists[2].genres).toEqual([])
            expect(result?.tracks).toHaveLength(4)
            expect(result?.tracks[0].artist).toBe('Main')
            expect(result?.tracks[1].artist).toBe('Unknown')
            expect(result?.tracks[2].artist).toBe('Unknown')
            expect(result?.tracks[3].artist).toBe('Unknown')
        })
    })

    describe('getUserSavedTracks', () => {
        it.each([
            [
                'response not ok',
                () =>
                    fetchMock.mockResolvedValue({ ok: false, json: async () => ({}) }),
            ],
            [
                'json parse fails',
                () => fetchMock.mockResolvedValue(jsonParseFail()),
            ],
            [
                'fetch rejects',
                () => fetchMock.mockRejectedValue(new Error('network error')),
            ],
            [
                'data has no items field',
                () =>
                    fetchMock.mockResolvedValue(
                        okWithJson(async () => ({ total: 10 })),
                    ),
            ],
            [
                'items array is empty',
                () =>
                    fetchMock.mockResolvedValue(
                        okWithJson(async () => ({ items: [], total: 100 })),
                    ),
            ],
        ])('returns empty array when %s', async (_label, arrange) => {
            arrange()
            expect(await getUserSavedTracks('token')).toEqual([])
        })

        it('returns track ids from a single page', async () => {
            fetchMock.mockResolvedValue(
                okWithJson(async () => ({
                    items: [
                        { track: { id: 'track-1' } },
                        { track: { id: 'track-2' } },
                    ],
                    total: 2,
                })),
            )

            expect(await getUserSavedTracks('token')).toEqual(['track-1', 'track-2'])
        })

        it('paginates until all tracks are fetched', async () => {
            let callCount = 0
            fetchMock.mockImplementation(async () => {
                callCount++
                if (callCount === 1) {
                    return okWithJson(async () => ({
                        items: Array.from({ length: 50 }, (_, i) => ({
                            track: { id: `track-${i}` },
                        })),
                        total: 60,
                    }))
                }
                return okWithJson(async () => ({
                    items: Array.from({ length: 10 }, (_, i) => ({
                        track: { id: `track-${50 + i}` },
                    })),
                    total: 60,
                }))
            })

            const result = await getUserSavedTracks('token')

            expect(result).toHaveLength(60)
            expect(fetchMock).toHaveBeenCalledTimes(2)
        })

        it('stops when maxTracks (200) is reached', async () => {
            fetchMock.mockImplementation(async () =>
                okWithJson(async () => ({
                    items: Array.from({ length: 50 }, (_, i) => ({
                        track: { id: `t${i}` },
                    })),
                    total: 1000,
                })),
            )

            const result = await getUserSavedTracks('token')

            expect(result.length).toBeLessThanOrEqual(200)
            expect(fetchMock).toHaveBeenCalledTimes(4)
        })

        it('breaks on non-ok response mid-pagination', async () => {
            let callCount = 0
            fetchMock.mockImplementation(async () => {
                callCount++
                if (callCount === 1) {
                    return okWithJson(async () => ({
                        items: [{ track: { id: 'track-1' } }],
                        total: 100,
                    }))
                }
                return { ok: false, json: async () => ({}) }
            })

            expect(await getUserSavedTracks('token')).toEqual(['track-1'])
        })

        it('skips items without a track id', async () => {
            fetchMock
                .mockResolvedValueOnce(
                    okWithJson(async () => ({
                        items: [
                            { track: { id: 'valid-1' } },
                            { track: {} },
                            { track: null },
                            {},
                            { track: { id: 'valid-2' } },
                        ],
                        total: 5,
                    })),
                )
                .mockResolvedValue(
                    okWithJson(async () => ({ items: [], total: 5 })),
                )

            expect(await getUserSavedTracks('token')).toEqual([
                'valid-1',
                'valid-2',
            ])
        })

        it('stops early when data.total matches accumulated count', async () => {
            let callCount = 0
            fetchMock.mockImplementation(async () => {
                callCount++
                return okWithJson(async () => ({
                    items: [{ track: { id: `t${callCount}` } }],
                    total: 1,
                }))
            })

            const result = await getUserSavedTracks('token')

            expect(result).toHaveLength(1)
            expect(fetchMock).toHaveBeenCalledTimes(1)
        })
    })
})
