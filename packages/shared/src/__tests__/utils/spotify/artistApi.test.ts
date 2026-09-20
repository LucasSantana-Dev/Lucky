import {
    describe,
    test,
    expect,
    beforeEach,
    afterEach,
    jest,
} from '@jest/globals'
import {
    searchSpotifyArtists,
    getSpotifyRelatedArtists,
    type SpotifyArtist,
} from '../../../../src/utils/spotify/artistApi'
import { errorLog, warnLog } from '../../../../src/utils/general/log'

jest.mock('../../../../src/utils/general/log', () => ({
    errorLog: jest.fn(),
    warnLog: jest.fn(),
    infoLog: jest.fn(),
    successLog: jest.fn(),
    debugLog: jest.fn(),
}))

describe('Spotify Artist API', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    const mockArtist: SpotifyArtist = {
        id: 'spotify-1',
        name: 'Drake',
        imageUrl: 'https://example.com/image.jpg',
        popularity: 85,
        genres: ['hip-hop', 'rap'],
    }

    describe('getSpotifyRelatedArtists', () => {
        const originalEnv = process.env

        beforeEach(() => {
            process.env = { ...originalEnv, LASTFM_API_KEY: 'test-key' }
        })

        afterEach(() => {
            process.env = originalEnv
        })

        test('returns artists via Last.fm and Spotify search', async () => {
            const fetchSpy = jest
                .spyOn(global, 'fetch')
                .mockResolvedValueOnce(
                    new Response(JSON.stringify({ name: 'Seed Artist' }), {
                        status: 200,
                    }),
                )
                .mockResolvedValueOnce(
                    new Response(
                        JSON.stringify({
                            similarartists: {
                                artist: [
                                    { name: 'Similar 1' },
                                    { name: 'Similar 2' },
                                ],
                            },
                        }),
                        { status: 200 },
                    ),
                )
                .mockResolvedValueOnce(
                    new Response(
                        JSON.stringify({
                            artists: {
                                items: [
                                    {
                                        id: 'art-1',
                                        name: 'Similar 1',
                                        images: [],
                                        popularity: 70,
                                        genres: [],
                                    },
                                ],
                            },
                        }),
                        { status: 200 },
                    ),
                )
                .mockResolvedValueOnce(
                    new Response(
                        JSON.stringify({
                            artists: {
                                items: [
                                    {
                                        id: 'art-2',
                                        name: 'Similar 2',
                                        images: [],
                                        popularity: 65,
                                        genres: [],
                                    },
                                ],
                            },
                        }),
                        { status: 200 },
                    ),
                )

            const result = await getSpotifyRelatedArtists(
                'access-token',
                'seed-id',
            )

            expect(result).toHaveLength(2)
            expect(result[0].id).toBe('art-1')
            expect(result[1].id).toBe('art-2')
            fetchSpy.mockRestore()
        })

        test('deduplicates artists with the same Spotify ID', async () => {
            const sameArtistBody = JSON.stringify({
                artists: {
                    items: [
                        {
                            id: 'art-1',
                            name: 'Same Artist',
                            images: [],
                            popularity: 70,
                            genres: [],
                        },
                    ],
                },
            })
            const fetchSpy = jest
                .spyOn(global, 'fetch')
                .mockResolvedValueOnce(
                    new Response(JSON.stringify({ name: 'Seed Artist' }), {
                        status: 200,
                    }),
                )
                .mockResolvedValueOnce(
                    new Response(
                        JSON.stringify({
                            similarartists: {
                                artist: [
                                    { name: 'Similar 1' },
                                    { name: 'Similar 2' },
                                ],
                            },
                        }),
                        { status: 200 },
                    ),
                )
                .mockResolvedValueOnce(
                    new Response(sameArtistBody, { status: 200 }),
                )
                .mockResolvedValueOnce(
                    new Response(sameArtistBody, { status: 200 }),
                )

            const result = await getSpotifyRelatedArtists(
                'access-token',
                'seed-id',
            )

            expect(result).toHaveLength(1)
            expect(result[0].id).toBe('art-1')
            fetchSpy.mockRestore()
        })

        test('returns [] when seed artist name fetch returns non-ok status', async () => {
            const fetchSpy = jest
                .spyOn(global, 'fetch')
                .mockResolvedValueOnce(
                    new Response(JSON.stringify({}), { status: 404 }),
                )

            const result = await getSpotifyRelatedArtists(
                'access-token',
                'unknown-id',
            )

            expect(result).toEqual([])
            fetchSpy.mockRestore()
        })

        test('returns [] when Last.fm returns no similar artists', async () => {
            const fetchSpy = jest
                .spyOn(global, 'fetch')
                .mockResolvedValueOnce(
                    new Response(JSON.stringify({ name: 'Seed Artist' }), {
                        status: 200,
                    }),
                )
                .mockResolvedValueOnce(
                    new Response(
                        JSON.stringify({ similarartists: { artist: [] } }),
                        { status: 200 },
                    ),
                )

            const result = await getSpotifyRelatedArtists(
                'access-token',
                'seed-id',
            )

            expect(result).toEqual([])
            fetchSpy.mockRestore()
        })

        test('returns [] when LASTFM_API_KEY is not configured', async () => {
            delete process.env.LASTFM_API_KEY
            const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValueOnce(
                new Response(JSON.stringify({ name: 'Seed Artist' }), {
                    status: 200,
                }),
            )

            const result = await getSpotifyRelatedArtists(
                'access-token',
                'seed-id',
            )

            expect(result).toEqual([])
            expect(fetchSpy).toHaveBeenCalledTimes(1)
            fetchSpy.mockRestore()
        })

        test('handles network error gracefully', async () => {
            const fetchSpy = jest
                .spyOn(global, 'fetch')
                .mockRejectedValueOnce(new Error('Network error'))

            const result = await getSpotifyRelatedArtists(
                'access-token',
                'seed-id',
            )

            expect(result).toEqual([])
            fetchSpy.mockRestore()
        })

        test('does not leak the raw error path into any log on failure', async () => {
            const warnSpy = jest
                .spyOn(console, 'warn')
                .mockImplementation(() => {})
            const fetchSpy = jest
                .spyOn(global, 'fetch')
                .mockRejectedValueOnce(
                    new Error('Network error /path/to/file:123:45'),
                )

            const result = await getSpotifyRelatedArtists(
                'access-token',
                'seed-id',
            )

            expect(result).toEqual([])
            // Whichever logger fires (warn here, or the structured errorLog catch),
            // the raw filesystem path from the error must never be logged (#1208).
            const structured = (fn: typeof errorLog) =>
                jest
                    .mocked(fn)
                    .mock.calls.flatMap((c) => [
                        c[0]?.message,
                        JSON.stringify(c[0]?.data),
                    ])
            const logged = [
                ...warnSpy.mock.calls.flat().map(String),
                ...structured(errorLog),
                ...structured(warnLog),
            ].join(' ')
            expect(logged).not.toContain('/path/to/file')

            warnSpy.mockRestore()
            fetchSpy.mockRestore()
        })
    })

    describe('searchSpotifyArtists', () => {
        test('should return artists matching search query', async () => {
            const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValueOnce(
                new Response(
                    JSON.stringify({
                        artists: {
                            items: [mockArtist],
                        },
                    }),
                    { status: 200 },
                ),
            )

            const result = await searchSpotifyArtists('access-token', 'Drake')

            expect(result).toHaveLength(1)
            expect(result[0].name).toBe('Drake')
            fetchSpy.mockRestore()
        })

        test('should return empty array for empty query', async () => {
            const result = await searchSpotifyArtists('access-token', '   ')

            expect(result).toEqual([])
        })

        test('should handle API errors gracefully', async () => {
            const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValueOnce(
                new Response(JSON.stringify({ error: 'Unauthorized' }), {
                    status: 401,
                }),
            )

            const result = await searchSpotifyArtists('bad-token', 'Drake')

            expect(result).toEqual([])
            fetchSpy.mockRestore()
        })

        test('should handle network errors gracefully', async () => {
            const fetchSpy = jest
                .spyOn(global, 'fetch')
                .mockRejectedValueOnce(new Error('Network error'))

            const result = await searchSpotifyArtists('access-token', 'Drake')

            expect(result).toEqual([])
            fetchSpy.mockRestore()
        })
    })
})
