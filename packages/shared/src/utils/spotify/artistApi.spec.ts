import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    jest,
} from '@jest/globals'
import { getSpotifyArtistTopTracks, getSpotifyArtistAlbums } from './artistApi'

describe('getSpotifyArtistTopTracks', () => {
    const originalFetch = global.fetch

    afterEach(() => {
        global.fetch = originalFetch
    })

    it('maps the top-tracks response into track refs', async () => {
        global.fetch = jest.fn(async () => ({
            ok: true,
            json: async () => ({
                tracks: [
                    {
                        name: 'Bohemian Rhapsody',
                        artists: [{ name: 'Queen' }],
                        external_urls: {
                            spotify: 'https://open.spotify.com/track/1',
                        },
                    },
                    // Missing url — should be dropped, not throw.
                    { name: 'No URL Track', artists: [{ name: 'Queen' }] },
                ],
            }),
        })) as unknown as typeof fetch

        const tracks = await getSpotifyArtistTopTracks('token', 'artist-1')

        expect(tracks).toEqual([
            {
                name: 'Bohemian Rhapsody',
                artist: 'Queen',
                url: 'https://open.spotify.com/track/1',
            },
        ])
    })

    it('returns an empty array when the request fails', async () => {
        global.fetch = jest.fn(async () => ({
            ok: false,
        })) as unknown as typeof fetch

        await expect(
            getSpotifyArtistTopTracks('token', 'artist-1'),
        ).resolves.toEqual([])
    })

    it('returns an empty array instead of throwing when fetch rejects', async () => {
        global.fetch = jest.fn(async () => {
            throw new Error('network down')
        }) as unknown as typeof fetch

        await expect(
            getSpotifyArtistTopTracks('token', 'artist-1'),
        ).resolves.toEqual([])
    })
})

describe('getSpotifyArtistAlbums', () => {
    const originalFetch = global.fetch

    beforeEach(() => {
        global.fetch = originalFetch
    })

    afterEach(() => {
        global.fetch = originalFetch
    })

    const album = (
        name: string,
        releaseDate: string,
        id = name.toLowerCase().replace(/\s+/g, '-'),
    ) => ({
        id,
        name,
        release_date: releaseDate,
        artists: [{ name: 'Queen' }],
        external_urls: { spotify: `https://open.spotify.com/album/${id}` },
    })

    it('sorts newest release first and dedupes by album name', async () => {
        global.fetch = jest.fn(async () => ({
            ok: true,
            json: async () => ({
                items: [
                    album('A Night at the Opera', '1975-11-21'),
                    album('Jazz', '1978-11-10'),
                    // Reissue sharing a name with an earlier item — dropped.
                    album('Jazz', '2011-01-01', 'jazz-deluxe'),
                ],
                next: null,
            }),
        })) as unknown as typeof fetch

        const albums = await getSpotifyArtistAlbums('token', 'artist-1')

        expect(albums.map((a) => a.name)).toEqual([
            'Jazz',
            'A Night at the Opera',
        ])
    })

    it('follows pagination until next is null', async () => {
        let call = 0
        global.fetch = jest.fn(async () => {
            call += 1
            if (call === 1) {
                return {
                    ok: true,
                    json: async () => ({
                        items: [album('Album One', '2020-01-01')],
                        next: 'https://api.spotify.com/v1/artists/artist-1/albums?offset=50',
                    }),
                }
            }
            return {
                ok: true,
                json: async () => ({
                    items: [album('Album Two', '2021-01-01')],
                    next: null,
                }),
            }
        }) as unknown as typeof fetch

        const albums = await getSpotifyArtistAlbums('token', 'artist-1')

        expect(global.fetch).toHaveBeenCalledTimes(2)
        expect(albums.map((a) => a.name).sort()).toEqual([
            'Album One',
            'Album Two',
        ])
    })

    it('caps results at maxAlbums', async () => {
        global.fetch = jest.fn(async () => ({
            ok: true,
            json: async () => ({
                items: Array.from({ length: 10 }, (_, i) =>
                    album(`Album ${i}`, `202${i}-01-01`),
                ),
                next: null,
            }),
        })) as unknown as typeof fetch

        const albums = await getSpotifyArtistAlbums('token', 'artist-1', 3)

        expect(albums).toHaveLength(3)
    })

    it('returns an empty array instead of throwing when fetch rejects', async () => {
        global.fetch = jest.fn(async () => {
            throw new Error('network down')
        }) as unknown as typeof fetch

        await expect(
            getSpotifyArtistAlbums('token', 'artist-1'),
        ).resolves.toEqual([])
    })
})
