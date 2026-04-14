import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import {
    handleSpotifySearch,
    handleYouTubeSearch,
    handleYouTubePlaylist,
} from './youtubeHandler'
import type { PlayCommandOptions } from './types'

const debugLogMock = jest.fn()
const errorLogMock = jest.fn()
const warnLogMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    debugLog: (payload: unknown) => debugLogMock(payload),
    errorLog: (payload: unknown) => errorLogMock(payload),
    warnLog: (payload: unknown) => warnLogMock(payload),
}))

function createUser(): PlayCommandOptions['user'] {
    return { id: 'user-1', tag: 'TestUser#0001' } as any
}

function createSearchResult(
    hasTracks: boolean,
    tracks: any[] = [],
    playlist: any = null,
) {
    return { hasTracks: () => hasTracks, tracks, playlist }
}

function createPlayer(
    impl: (query: string, opts: any) => any,
): PlayCommandOptions['player'] {
    return { search: jest.fn(impl) } as any
}

const GUILD = 'guild-1'
const CHANNEL = 'channel-1'

describe('youtubeHandler', () => {
    beforeEach(() => jest.clearAllMocks())

    describe('handleSpotifySearch', () => {
        it('returns success with tracks when Spotify search finds results', async () => {
            const track = { title: 'Test', url: 'https://spotify.com/track/1' }
            const player = createPlayer(() => createSearchResult(true, [track]))

            const result = await handleSpotifySearch(
                'test query',
                createUser(),
                GUILD,
                CHANNEL,
                player,
            )

            expect(result.success).toBe(true)
            expect(result.tracks).toEqual([track])
        })

        it('returns success=false silently when Spotify search finds no tracks', async () => {
            const player = createPlayer(() => createSearchResult(false))

            const result = await handleSpotifySearch(
                'test query',
                createUser(),
                GUILD,
                CHANNEL,
                player,
            )

            expect(result.success).toBe(false)
            expect(result.error).toBe('')
        })

        it('returns success=false silently when Spotify search throws', async () => {
            const player = createPlayer(() => {
                throw new Error('Network error')
            })

            const result = await handleSpotifySearch(
                'test query',
                createUser(),
                GUILD,
                CHANNEL,
                player,
            )

            expect(result.success).toBe(false)
            expect(result.error).toBe('')
            expect(warnLogMock).toHaveBeenCalled()
        })
    })

    describe('handleYouTubeSearch', () => {
        it('returns success with tracks when search finds results', async () => {
            const track = {
                title: 'Never Gonna',
                url: 'https://youtube.com/watch?v=1',
            }
            const player = createPlayer(() => createSearchResult(true, [track]))

            const result = await handleYouTubeSearch(
                'never gonna give you up',
                createUser(),
                GUILD,
                CHANNEL,
                player,
            )

            expect(result.success).toBe(true)
            expect(result.tracks).toEqual([track])
        })

        it('returns error when search finds no tracks', async () => {
            const player = createPlayer(() => createSearchResult(false))

            const result = await handleYouTubeSearch(
                'gibberish xyz 123',
                createUser(),
                GUILD,
                CHANNEL,
                player,
            )

            expect(result.success).toBe(false)
            expect(result.error).toBe('No tracks found for your search')
        })

        it('returns isPlaylist=true when result contains a playlist', async () => {
            const tracks = [{ title: 'Track 1' }, { title: 'Track 2' }]
            const playlist = { title: 'My Playlist', tracks }
            const player = createPlayer(() =>
                createSearchResult(true, tracks, playlist),
            )

            const result = await handleYouTubeSearch(
                'https://youtube.com/playlist?list=abc',
                createUser(),
                GUILD,
                CHANNEL,
                player,
            )

            expect(result.success).toBe(true)
            expect(result.isPlaylist).toBe(true)
        })

        it('returns isPlaylist=false for single track result', async () => {
            const player = createPlayer(() =>
                createSearchResult(true, [{ title: 'Track' }], null),
            )

            const result = await handleYouTubeSearch(
                'never gonna give you up',
                createUser(),
                GUILD,
                CHANNEL,
                player,
            )

            expect(result.success).toBe(true)
            expect(result.isPlaylist).toBe(false)
        })

        it('returns error when player.search throws', async () => {
            const player = createPlayer(() => {
                throw new Error('Search engine down')
            })

            const result = await handleYouTubeSearch(
                'test',
                createUser(),
                GUILD,
                CHANNEL,
                player,
            )

            expect(result.success).toBe(false)
            expect(result.error).toBe('Failed to process YouTube search')
            expect(errorLogMock).toHaveBeenCalled()
        })
    })

    describe('handleYouTubePlaylist', () => {
        it('returns success when URL resolves to a playlist', async () => {
            const tracks = [{ title: 'Track 1' }, { title: 'Track 2' }]
            const playlist = { title: 'My Playlist' }
            const player = createPlayer(() =>
                createSearchResult(true, tracks, playlist),
            )

            const result = await handleYouTubePlaylist(
                'https://youtube.com/playlist?list=PLtest',
                createUser(),
                GUILD,
                CHANNEL,
                player,
            )

            expect(result.success).toBe(true)
            expect(result.tracks).toEqual(tracks)
            expect(result.isPlaylist).toBe(true)
        })

        it('returns error when URL resolves to a single track (not a playlist)', async () => {
            const player = createPlayer(() =>
                createSearchResult(true, [{ title: 'Track' }], null),
            )

            const result = await handleYouTubePlaylist(
                'https://youtube.com/watch?v=abc',
                createUser(),
                GUILD,
                CHANNEL,
                player,
            )

            expect(result.success).toBe(false)
            expect(result.error).toBe('The provided URL is not a playlist')
        })

        it('returns error when search finds no tracks', async () => {
            const player = createPlayer(() => createSearchResult(false))

            const result = await handleYouTubePlaylist(
                'https://youtube.com/playlist?list=invalid',
                createUser(),
                GUILD,
                CHANNEL,
                player,
            )

            expect(result.success).toBe(false)
            expect(result.error).toBe('No tracks found in playlist')
        })

        it('returns error when player.search throws', async () => {
            const player = createPlayer(() => {
                throw new Error('Timeout')
            })

            const result = await handleYouTubePlaylist(
                'https://youtube.com/playlist?list=abc',
                createUser(),
                GUILD,
                CHANNEL,
                player,
            )

            expect(result.success).toBe(false)
            expect(result.error).toBe('Failed to process YouTube playlist')
            expect(errorLogMock).toHaveBeenCalled()
        })
    })
})
