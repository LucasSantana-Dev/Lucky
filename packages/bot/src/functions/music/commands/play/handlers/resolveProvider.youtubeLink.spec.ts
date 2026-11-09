import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    jest,
} from '@jest/globals'
import { QueryType } from 'discord-player'

const warnLogMock = jest.fn()
const fetchYoutubeOEmbedMock = jest.fn<(url: string) => Promise<unknown>>()

jest.mock('@lucky/shared/utils', () => ({
    warnLog: warnLogMock,
}))

jest.mock('@lucky/shared/utils/monitoring', () => ({
    addBreadcrumb: jest.fn(),
}))

jest.mock('./trackMetadataHydration', () => ({
    ensureTrackMetadata: async (result: unknown) => result,
    fetchYoutubeOEmbed: (url: string) => fetchYoutubeOEmbedMock(url),
}))

import {
    resolveQueryWithFallbacks,
    YoutubePlaylistUnavailableError,
    YoutubeVideoUnavailableError,
} from './resolveProvider'

class NoResultError extends Error {
    constructor(message: string) {
        super(message)
        this.name = 'NoResultError'
    }
}

const VIDEO_URL = 'https://www.youtube.com/watch?v=abcDEF12345&list=PLxyz'
const PLAYLIST_URL = 'https://www.youtube.com/playlist?list=PLxyz'

describe('resolveQueryWithFallbacks with a YouTube link', () => {
    const originalEnv = process.env.HOSTED_YOUTUBE_ENABLED
    let player: { play: jest.Mock<(...args: unknown[]) => Promise<unknown>> }
    const voiceChannel = { id: 'vc-1' } as never

    const resolve = (query: string) =>
        resolveQueryWithFallbacks(
            player as never,
            voiceChannel,
            query,
            'default',
            QueryType.AUTO,
            { searchEngine: QueryType.AUTO } as never,
        )

    const engines = () =>
        player.play.mock.calls.map(
            (call) => (call[2] as { searchEngine: unknown }).searchEngine,
        )
    const queries = () => player.play.mock.calls.map((call) => call[1])

    beforeEach(() => {
        jest.clearAllMocks()
        delete process.env.HOSTED_YOUTUBE_ENABLED
        player = { play: jest.fn() }
        fetchYoutubeOEmbedMock.mockResolvedValue({
            title: 'Artist Name - Song Title (Official Video)',
            author_name: 'Artist Name',
        })
    })

    afterEach(() => {
        if (originalEnv === undefined) delete process.env.HOSTED_YOUTUBE_ENABLED
        else process.env.HOSTED_YOUTUBE_ENABLED = originalEnv
    })

    it('searches the oEmbed title on Spotify when the video link has no result', async () => {
        const track = { title: 'Song Title' }
        player.play
            .mockRejectedValueOnce(new NoResultError('No results found'))
            .mockResolvedValueOnce(track)

        const { result, telemetry } = await resolve(VIDEO_URL)

        expect(result).toBe(track)
        expect(fetchYoutubeOEmbedMock).toHaveBeenCalledWith(
            'https://www.youtube.com/watch?v=abcDEF12345',
        )
        expect(queries()[0]).toBe(VIDEO_URL)
        expect(queries()[1]).toEqual(expect.stringContaining('Song Title'))
        expect(queries()[1]).not.toMatch(/official video/i)
        expect(engines()).toEqual([QueryType.AUTO, QueryType.SPOTIFY_SEARCH])
        expect(telemetry.resolvedVia).toBe('youtube-title-fallback')
        expect(telemetry.titleFallbackVia).toBe('primary')
    })

    it('treats an exhausted stream bridge like a missing result', async () => {
        const track = { title: 'Song Title' }
        player.play
            .mockRejectedValueOnce(
                new Error('Bridge exhausted: every stage failed'),
            )
            .mockResolvedValueOnce(track)

        const { telemetry } = await resolve('https://youtu.be/abcDEF12345')

        expect(telemetry.resolvedVia).toBe('youtube-title-fallback')
    })

    it('goes Spotify then SoundCloud for the title, never back to YouTube', async () => {
        const track = { title: 'Song Title' }
        player.play
            .mockRejectedValueOnce(new NoResultError('No results found'))
            .mockRejectedValueOnce(new NoResultError('spotify'))
            .mockRejectedValueOnce(new NoResultError('spotify retry'))
            .mockResolvedValueOnce(track)

        const { result, telemetry } = await resolve(
            'https://music.youtube.com/watch?v=abcDEF12345',
        )

        expect(result).toBe(track)
        expect(engines()).toEqual([
            QueryType.AUTO,
            QueryType.SPOTIFY_SEARCH,
            QueryType.SPOTIFY_SEARCH,
            QueryType.SOUNDCLOUD_SEARCH,
        ])
        expect(telemetry.titleFallbackVia).toBe('soundcloud-fallback')
    })

    it('rethrows the link error when the title search finds nothing', async () => {
        const linkError = new NoResultError('No results found for link')
        player.play
            .mockRejectedValueOnce(linkError)
            .mockRejectedValue(new NoResultError('nothing'))

        await expect(resolve(VIDEO_URL)).rejects.toBe(linkError)
    })

    it('rethrows the link error when oEmbed has no title', async () => {
        const linkError = new NoResultError('No results found for link')
        player.play.mockRejectedValueOnce(linkError)
        fetchYoutubeOEmbedMock.mockResolvedValue(null)

        await expect(resolve(VIDEO_URL)).rejects.toBe(linkError)
        expect(player.play).toHaveBeenCalledTimes(1)
    })

    it('does not fall back on errors other than a missing result', async () => {
        const voiceError = new Error('Cannot connect to voice')
        player.play.mockRejectedValueOnce(voiceError)

        await expect(resolve(VIDEO_URL)).rejects.toBe(voiceError)
        expect(fetchYoutubeOEmbedMock).not.toHaveBeenCalled()
    })

    it('answers a failed playlist-only link with YoutubePlaylistUnavailableError', async () => {
        player.play.mockRejectedValueOnce(new NoResultError('No results'))

        await expect(resolve(PLAYLIST_URL)).rejects.toBeInstanceOf(
            YoutubePlaylistUnavailableError,
        )
        expect(fetchYoutubeOEmbedMock).not.toHaveBeenCalled()
    })

    it('leaves a playlist link that resolves alone', async () => {
        const track = { title: 'First' }
        player.play.mockResolvedValueOnce(track)

        const { telemetry } = await resolve(PLAYLIST_URL)

        expect(telemetry.resolvedVia).toBe('primary')
    })

    describe('HOSTED_YOUTUBE_ENABLED=false', () => {
        beforeEach(() => {
            process.env.HOSTED_YOUTUBE_ENABLED = 'false'
        })

        it('skips the link and searches the title directly', async () => {
            const track = { title: 'Song Title' }
            player.play.mockResolvedValueOnce(track)

            const { result, telemetry } = await resolve(VIDEO_URL)

            expect(result).toBe(track)
            expect(engines()).toEqual([QueryType.SPOTIFY_SEARCH])
            expect(queries()[0]).not.toContain('youtube.com')
            expect(telemetry.resolvedVia).toBe('youtube-title-fallback')
        })

        it('throws YoutubeVideoUnavailableError when oEmbed has no title', async () => {
            fetchYoutubeOEmbedMock.mockResolvedValue({})

            await expect(resolve(VIDEO_URL)).rejects.toBeInstanceOf(
                YoutubeVideoUnavailableError,
            )
            expect(player.play).not.toHaveBeenCalled()
        })

        it('rethrows the text search error when no provider has the title', async () => {
            const textError = new NoResultError('No results found')
            player.play.mockRejectedValue(textError)

            await expect(resolve(VIDEO_URL)).rejects.toBe(textError)
            expect(engines()).not.toContain(QueryType.YOUTUBE_SEARCH)
        })

        it('answers a playlist link without asking YouTube', async () => {
            await expect(resolve(PLAYLIST_URL)).rejects.toBeInstanceOf(
                YoutubePlaylistUnavailableError,
            )
            expect(player.play).not.toHaveBeenCalled()
        })
    })
})
