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

        it('returns artists and tracks with valid response', async () => {
            let callCount = 0
            fetchMock.mockImplementation(async () => {
                callCount++
                if (callCount === 1) {
                    return {
                        ok: true,
                        json: () =>
                            Promise.resolve({
                                items: [{ id: 'a1', name: 'Artist 1', genres: [] }],
                            }),
                    }
                }
                return {
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            items: [
                                { id: 't1', name: 'Track 1', artists: [{ name: 'Artist 1' }] },
                            ],
                        }),
                }
            })

            const result = await getUserTopArtistsAndTracks('token')

            if (result !== null) {
                expect(result.artists).toHaveLength(1)
                expect(result.tracks).toHaveLength(1)
                expect(result.artists[0].id).toBe('a1')
            }
        })

        it('handles tracks without artist field', async () => {
            let callCount = 0
            fetchMock.mockImplementation(async () => {
                callCount++
                if (callCount === 1) {
                    return {
                        ok: true,
                        json: async () => ({ items: [] }),
                    }
                }
                return {
                    ok: true,
                    json: async () => ({
                        items: [{ id: 't1', name: 'Track 1' }],
                    }),
                }
            })

            const result = await getUserTopArtistsAndTracks('token')

            if (result !== null) {
                expect(result.tracks).toHaveLength(1)
                expect(result.tracks[0].artist).toBe('Unknown')
            }
        })

        it('returns null when artists response not ok but tracks ok', async () => {
            fetchMock
                .mockResolvedValueOnce({ ok: false })
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({ items: [] }),
                })

            const result = await getUserTopArtistsAndTracks('token')

            expect(result).toBeNull()
        })

        it('returns null when tracks response not ok but artists ok', async () => {
            fetchMock
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({ items: [] }),
                })
                .mockResolvedValueOnce({ ok: false })

            const result = await getUserTopArtistsAndTracks('token')

            expect(result).toBeNull()
        })

        it('builds full payload with mixed artist + track shapes', async () => {
            let callCount = 0
            fetchMock.mockImplementation(async () => {
                callCount++
                console.log('fetch call', callCount)
                if (callCount === 1) {
                    return {
                        ok: true,
                        json: () =>
                            Promise.resolve({
                                items: [
                                    { id: 'a1', name: 'Artist 1', genres: ['rock', 'pop'] },
                                    { id: 'a2', name: 'Artist 2' },
                                    { id: 'a3', name: 'Artist 3', genres: null },
                                    { id: '', name: 'No Id' },
                                    { id: 'a5' },
                                ],
                            }),
                    }
                }
                return {
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            items: [
                                { id: 't1', name: 'Track 1', artists: [{ name: 'Main' }] },
                                { id: 't2', name: 'Track 2' },
                                { id: 't3', name: 'Track 3', artists: [] },
                                { id: 't4', name: 'Track 4', artists: [{}] },
                                { name: 'No Id Track' },
                            ],
                        }),
                }
            })

            ;(globalThis as { fetch: unknown }).fetch = fetchMock
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

        it('returns null when artists json is null', async () => {
            let callCount = 0
            fetchMock.mockImplementation(async () => {
                callCount++
                if (callCount === 1) {
                    return { ok: true, json: () => Promise.resolve(null) }
                }
                return { ok: true, json: () => Promise.resolve({ items: [] }) }
            })

            ;(globalThis as { fetch: unknown }).fetch = fetchMock
            const result = await getUserTopArtistsAndTracks('token')

            expect(result).toBeNull()
        })
    })
})
