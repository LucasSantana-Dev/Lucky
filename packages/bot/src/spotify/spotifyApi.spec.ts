import {
    describe,
    it,
    expect,
    beforeEach,
    jest,
    afterEach,
} from '@jest/globals'
import {
    searchSpotifyTrack,
    getArtistPopularity,
    getArtistGenres,
    getUserTopArtistsAndTracks,
    getUserSavedTracks,
    _resetPopularityCache,
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
            // Vehicle only: any single-fetch helper exercises spotifyFetch's
            // AbortSignal. Was getAudioFeatures until that endpoint was removed.
            fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) })
            await searchSpotifyTrack('test-token', 'Creep', 'Radiohead')
            expect(fetchMock).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({ signal: expect.any(AbortSignal) }),
            )
        })

        it('surfaces a timeout as the normal error fallback without a 429 retry', async () => {
            fetchMock.mockRejectedValue(
                new DOMException('The operation timed out', 'TimeoutError'),
            )
            const result = await searchSpotifyTrack(
                'test-token',
                'Creep',
                'Radiohead',
            )
            expect(result).toBeNull()
            expect(fetchMock).toHaveBeenCalledTimes(1)
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

    describe('getArtistPopularity', () => {
        beforeEach(() => {
            _resetPopularityCache()
        })

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
            [
                'cache hit/miss behavior avoids duplicate fetches',
                async () => {
                    fetchMock.mockResolvedValue({
                        ok: true,
                        json: async () => ({
                            artists: { items: [{ popularity: 82 }] },
                        }),
                    })
                    const firstCall = await getArtistPopularity(
                        'token',
                        'Adele',
                    )
                    expect(firstCall).toBe(82)
                    expect(fetchMock).toHaveBeenCalledTimes(1)

                    const secondCall = await getArtistPopularity(
                        'token',
                        'Adele',
                    )
                    expect(secondCall).toBe(82)
                    expect(fetchMock).toHaveBeenCalledTimes(1)
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
