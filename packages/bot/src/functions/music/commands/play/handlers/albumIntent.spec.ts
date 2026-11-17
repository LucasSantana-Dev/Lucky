import { describe, expect, it, jest, beforeEach } from '@jest/globals'

const searchSpotifyAlbums =
    jest.fn<(q: string, limit?: number) => Promise<unknown[]>>()

jest.mock('@lucky/shared/utils', () => ({
    searchSpotifyAlbums: (q: string, limit?: number) =>
        searchSpotifyAlbums(q, limit),
}))

import { albumIntentQuery, resolveAlbumIntent } from './albumIntent'

const album = (name: string, artist: string, id = name) => ({
    id,
    name,
    artist,
    url: `https://open.spotify.com/album/${id}`,
})

describe('albumIntentQuery', () => {
    it('strips the album words from a full-album request', () => {
        expect(albumIntentQuery('album esquinas anavitória completo')).toBe(
            'esquinas anavitória',
        )
        expect(albumIntentQuery('Esquinas Álbum Completo')).toBe('Esquinas')
        expect(albumIntentQuery('full album abbey road')).toBe('abbey road')
    })

    it('returns null without an album word, for a link, or for nothing else', () => {
        expect(albumIntentQuery('esquinas anavitória')).toBeNull()
        expect(
            albumIntentQuery('https://open.spotify.com/album/123'),
        ).toBeNull()
        expect(albumIntentQuery('álbum completo')).toBeNull()
    })
})

describe('resolveAlbumIntent', () => {
    beforeEach(() => searchSpotifyAlbums.mockReset())

    it('returns the album URL when the album name is in the request', async () => {
        searchSpotifyAlbums.mockResolvedValue([
            album('Esquinas', 'ANAVITÓRIA', 'esq'),
        ])

        await expect(
            resolveAlbumIntent('album esquinas anavitória completo'),
        ).resolves.toBe('https://open.spotify.com/album/esq')
        expect(searchSpotifyAlbums).toHaveBeenCalledWith(
            'esquinas anavitória',
            5,
        )
    })

    it('prefers the album by the artist named in the request', async () => {
        searchSpotifyAlbums.mockResolvedValue([
            album('Esquinas', 'Djavan', 'dj'),
            album('Esquinas', 'ANAVITÓRIA', 'av'),
        ])

        await expect(
            resolveAlbumIntent('album esquinas anavitoria'),
        ).resolves.toBe('https://open.spotify.com/album/av')
    })

    it('ignores albums whose name is not in the request', async () => {
        searchSpotifyAlbums.mockResolvedValue([
            album('Ponta Solta', 'ANAVITÓRIA'),
        ])

        await expect(
            resolveAlbumIntent('album esquinas anavitória'),
        ).resolves.toBeNull()
    })

    it('takes a self-titled album only when the request is the artist alone', async () => {
        searchSpotifyAlbums.mockResolvedValue([
            album('ANAVITÓRIA', 'ANAVITÓRIA', 'self'),
        ])

        await expect(
            resolveAlbumIntent('album esquinas anavitória'),
        ).resolves.toBeNull()
        await expect(resolveAlbumIntent('album anavitoria')).resolves.toBe(
            'https://open.spotify.com/album/self',
        )
    })

    it('does not search without an album word', async () => {
        await expect(resolveAlbumIntent('esquinas')).resolves.toBeNull()
        expect(searchSpotifyAlbums).not.toHaveBeenCalled()
    })

    it('returns null when the album search fails', async () => {
        searchSpotifyAlbums.mockRejectedValue(new Error('network'))

        await expect(resolveAlbumIntent('album esquinas')).resolves.toBeNull()
    })
})
