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

// Spotify deprecated /v1/recommendations and /v1/artists/{id}/related-artists
// for new apps in 2024 (PR #648). The current impl uses a three-step chain:
//   1. GET https://api.spotify.com/v1/artists/{id} → seed artist name
//   2. GET https://ws.audioscrobbler.com/2.0/?method=artist.getSimilar → similar names
//   3. GET https://api.spotify.com/v1/search?type=artist (per name) → full artist
// All three call `global.fetch`, so the tests below mock `fetch` with sequential
// `mockResolvedValueOnce` responses in that order.

function makeSpotifyArtistNameResponse(name: string) {
    return new Response(JSON.stringify({ name }), { status: 200 })
}

function makeLastFmSimilarResponse(names: string[]) {
    return new Response(
        JSON.stringify({
            similarartists: { artist: names.map((name) => ({ name })) },
        }),
        { status: 200 },
    )
}

function makeSpotifySearchResponse(
    artists: Array<{
        id: string
        name: string
        imageUrl?: string
        popularity?: number
        genres?: string[]
    }>,
) {
    return new Response(
        JSON.stringify({
            artists: {
                items: artists.map((a) => ({
                    id: a.id,
                    name: a.name,
                    images: a.imageUrl ? [{ url: a.imageUrl }] : [],
                    popularity: a.popularity ?? 50,
                    genres: a.genres ?? [],
                })),
            },
        }),
        { status: 200 },
    )
}

describe('Spotify Artist API', () => {
    const originalLastFmKey = process.env.LASTFM_API_KEY

    beforeEach(() => {
        jest.clearAllMocks()
        process.env.LASTFM_API_KEY = 'test-lastfm-key'
    })

    afterEach(() => {
        if (originalLastFmKey === undefined) {
            delete process.env.LASTFM_API_KEY
        } else {
            process.env.LASTFM_API_KEY = originalLastFmKey
        }
    })

    const mockArtist: SpotifyArtist = {
        id: 'spotify-1',
        name: 'Drake',
        imageUrl: 'https://example.com/image.jpg',
        popularity: 85,
        genres: ['hip-hop', 'rap'],
    }

    describe('getSpotifyRelatedArtists', () => {
        test('returns artists found via Spotify → Last.fm → Spotify search chain', async () => {
            const fetchSpy = jest
                .spyOn(global, 'fetch')
                // 1. Spotify seed-artist lookup
                .mockResolvedValueOnce(makeSpotifyArtistNameResponse('Drake'))
                // 2. Last.fm similar artist names
                .mockResolvedValueOnce(
                    makeLastFmSimilarResponse([
                        'Artist One',
                        'Artist Two',
                        'Artist Three',
                    ]),
                )
                // 3. Spotify search per similar name — one artist each
                .mockResolvedValueOnce(
                    makeSpotifySearchResponse([
                        {
                            id: 'artist-1',
                            name: 'Artist One',
                            imageUrl: 'http://example.com/img1.jpg',
                            popularity: 80,
                            genres: ['pop'],
                        },
                    ]),
                )
                .mockResolvedValueOnce(
                    makeSpotifySearchResponse([
                        {
                            id: 'artist-2',
                            name: 'Artist Two',
                            imageUrl: 'http://example.com/img2.jpg',
                            popularity: 75,
                            genres: ['rock'],
                        },
                    ]),
                )
                .mockResolvedValueOnce(
                    makeSpotifySearchResponse([
                        {
                            id: 'artist-3',
                            name: 'Artist Three',
                            imageUrl: 'http://example.com/img3.jpg',
                            popularity: 70,
                            genres: ['jazz'],
                        },
                    ]),
                )

            const result = await getSpotifyRelatedArtists(
                'access-token',
                'seed-artist',
            )

            expect(result).toHaveLength(3)
            expect(result[0].id).toBe('artist-1')
            expect(result[1].id).toBe('artist-2')
            expect(result[2].id).toBe('artist-3')
            fetchSpy.mockRestore()
        })

        test('deduplicates when distinct similar names resolve to the same Spotify id', async () => {
            const fetchSpy = jest
                .spyOn(global, 'fetch')
                .mockResolvedValueOnce(makeSpotifyArtistNameResponse('Drake'))
                .mockResolvedValueOnce(
                    makeLastFmSimilarResponse([
                        'Artist One',
                        'Artist One (alias)',
                    ]),
                )
                // Both names happen to resolve to the same Spotify artist id
                .mockResolvedValueOnce(
                    makeSpotifySearchResponse([
                        {
                            id: 'artist-1',
                            name: 'Artist One',
                            imageUrl: 'http://example.com/img1.jpg',
                            popularity: 80,
                            genres: ['pop'],
                        },
                    ]),
                )
                .mockResolvedValueOnce(
                    makeSpotifySearchResponse([
                        {
                            id: 'artist-1',
                            name: 'Artist One',
                            imageUrl: 'http://example.com/img1.jpg',
                            popularity: 80,
                            genres: ['pop'],
                        },
                    ]),
                )

            const result = await getSpotifyRelatedArtists(
                'access-token',
                'seed-artist',
            )

            expect(result).toHaveLength(1)
            expect(result[0].id).toBe('artist-1')
            fetchSpy.mockRestore()
        })

        test('should handle API 403 error gracefully', async () => {
            const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValueOnce(
                new Response(JSON.stringify({ error: 'Forbidden' }), {
                    status: 403,
                }),
            )

            const result = await getSpotifyRelatedArtists(
                'invalid-token',
                'artist-id',
            )

            expect(result).toEqual([])
            fetchSpy.mockRestore()
        })

        test('should handle empty response', async () => {
            const fetchSpy = jest
                .spyOn(global, 'fetch')
                .mockResolvedValueOnce(
                    new Response(JSON.stringify({ tracks: [] }), {
                        status: 200,
                    }),
                )

            const result = await getSpotifyRelatedArtists(
                'access-token',
                'artist-id',
            )

            expect(result).toEqual([])
            fetchSpy.mockRestore()
        })

        test('returns all unique resolved artists from Last.fm similar (no artificial cap below the lookup bound)', async () => {
            // The pre-#648 impl capped to 12; the new impl asks Last.fm for up to
            // Math.max(limit, 30) names, looks each up via Spotify search, dedupes,
            // and returns the full unique set. This guards against re-introducing
            // a silent cap.
            const similarNames = Array.from(
                { length: 15 },
                (_, i) => `Artist ${i}`,
            )

            const fetchSpy = jest
                .spyOn(global, 'fetch')
                .mockResolvedValueOnce(makeSpotifyArtistNameResponse('Drake'))
                .mockResolvedValueOnce(makeLastFmSimilarResponse(similarNames))

            for (let i = 0; i < similarNames.length; i++) {
                fetchSpy.mockResolvedValueOnce(
                    makeSpotifySearchResponse([
                        {
                            id: `artist-${i}`,
                            name: `Artist ${i}`,
                            imageUrl: `http://example.com/img${i}.jpg`,
                            popularity: 80 - i,
                            genres: ['pop'],
                        },
                    ]),
                )
            }

            const result = await getSpotifyRelatedArtists(
                'access-token',
                'artist-id',
            )

            expect(result).toHaveLength(15)
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
