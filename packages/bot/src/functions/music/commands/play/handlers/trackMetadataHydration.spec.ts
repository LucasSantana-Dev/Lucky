import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    jest,
} from '@jest/globals'
import type { SearchResult, Track } from 'discord-player'

const warnLogMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    warnLog: warnLogMock,
}))

import {
    ensureTrackMetadata,
    TrackMetadataUnavailableError,
} from './trackMetadataHydration'

const VIDEO_URL = 'https://www.youtube.com/watch?v=XxnUy3MKHoM'

function trackOf(overrides: Partial<Track> = {}): Track {
    return {
        title: '',
        author: '',
        url: VIDEO_URL,
        thumbnail: 'https://www.iconpacks.net/youtube-logo.png',
        description: ' by ',
        cleanTitle: '',
        duration: '0:00',
        ...overrides,
    } as Track
}

function resultOf(tracks: Track[], playlist = false): SearchResult {
    return {
        tracks,
        hasPlaylist: () => playlist,
    } as unknown as SearchResult
}

function oEmbedResponse(body: unknown, ok = true): Response {
    return { ok, json: async () => body } as unknown as Response
}

describe('ensureTrackMetadata', () => {
    let fetchMock: jest.Mock<typeof fetch>

    beforeEach(() => {
        jest.clearAllMocks()
        fetchMock = jest.fn<typeof fetch>()
        global.fetch = fetchMock
    })

    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('leaves a track that already has a title untouched', async () => {
        const result = resultOf([trackOf({ title: 'Song', author: 'Artist' })])

        await expect(ensureTrackMetadata(result)).resolves.toBe(result)
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('leaves playlists alone', async () => {
        const result = resultOf([trackOf()], true)

        await expect(ensureTrackMetadata(result)).resolves.toBe(result)
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('fills an empty YouTube track from oEmbed before play', async () => {
        fetchMock.mockResolvedValue(
            oEmbedResponse({
                title: 'Lil Peep | 1 Hour Chill Mix',
                author_name: 'shimgu',
                thumbnail_url:
                    'https://i.ytimg.com/vi/XxnUy3MKHoM/hqdefault.jpg',
            }),
        )
        const track = trackOf()

        const result = await ensureTrackMetadata(resultOf([track]))

        expect(result.tracks[0]).toBe(track)
        expect(track.title).toBe('Lil Peep | 1 Hour Chill Mix')
        expect(track.cleanTitle).toBe('Lil Peep | 1 Hour Chill Mix')
        expect(track.author).toBe('shimgu')
        expect(track.thumbnail).toBe(
            'https://i.ytimg.com/vi/XxnUy3MKHoM/hqdefault.jpg',
        )
        const requested = String(fetchMock.mock.calls[0][0])
        expect(requested).toContain('https://www.youtube.com/oembed?')
        expect(requested).toContain(encodeURIComponent(VIDEO_URL))
    })

    it('rejects when oEmbed fails, so nothing plays with a blank title', async () => {
        fetchMock.mockResolvedValue(oEmbedResponse({}, false))

        await expect(
            ensureTrackMetadata(resultOf([trackOf()])),
        ).rejects.toBeInstanceOf(TrackMetadataUnavailableError)
    })

    it('rejects when oEmbed throws (timeout, network)', async () => {
        fetchMock.mockRejectedValue(new Error('The operation was aborted'))

        await expect(
            ensureTrackMetadata(resultOf([trackOf()])),
        ).rejects.toBeInstanceOf(TrackMetadataUnavailableError)
    })

    it('rejects when oEmbed answers without a title', async () => {
        fetchMock.mockResolvedValue(oEmbedResponse({ title: '  ' }))

        await expect(
            ensureTrackMetadata(resultOf([trackOf()])),
        ).rejects.toBeInstanceOf(TrackMetadataUnavailableError)
    })

    it('rejects an empty non-YouTube track without calling oEmbed', async () => {
        const track = trackOf({ url: 'https://soundcloud.com/a/b' })

        await expect(
            ensureTrackMetadata(resultOf([track])),
        ).rejects.toBeInstanceOf(TrackMetadataUnavailableError)
        expect(fetchMock).not.toHaveBeenCalled()
    })
})
