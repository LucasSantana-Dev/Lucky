import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import { PlayCommandProcessor } from './processor'
import type { PlayCommandOptions } from './types'

const debugLogMock = jest.fn()
const errorLogMock = jest.fn()
const manageQueueMock = jest.fn()
const handleSpotifyTrackMock = jest.fn()
const handleSpotifyPlaylistMock = jest.fn()
const handleSpotifySearchMock = jest.fn()
const handleYouTubeSearchMock = jest.fn()
const handleYouTubePlaylistMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    debugLog: (p: unknown) => debugLogMock(p),
    errorLog: (p: unknown) => errorLogMock(p),
}))

jest.mock('./queueManager', () => ({
    manageQueue: (...args: unknown[]) => manageQueueMock(...args),
}))

jest.mock('./spotifyHandler', () => ({
    handleSpotifyTrack: (...args: unknown[]) => handleSpotifyTrackMock(...args),
    handleSpotifyPlaylist: (...args: unknown[]) =>
        handleSpotifyPlaylistMock(...args),
}))

jest.mock('./youtubeHandler', () => ({
    handleYouTubeSearch: (...args: unknown[]) =>
        handleYouTubeSearchMock(...args),
    handleYouTubePlaylist: (...args: unknown[]) =>
        handleYouTubePlaylistMock(...args),
    handleSpotifySearch: (...args: unknown[]) =>
        handleSpotifySearchMock(...args),
}))

const SUCCESS_RESULT = {
    success: true,
    tracks: [{ title: 'Track' }],
    isPlaylist: false,
}
const FAIL_RESULT = { success: false, error: 'Not found' }

function createOptions(query: string): PlayCommandOptions {
    return {
        query,
        user: { id: 'user-1' } as any,
        guildId: 'guild-1',
        channelId: 'channel-1',
        player: {} as any,
        queue: {} as any,
        interaction: {} as any,
    }
}

describe('PlayCommandProcessor', () => {
    let processor: PlayCommandProcessor

    beforeEach(() => {
        jest.clearAllMocks()
        processor = new PlayCommandProcessor()
        manageQueueMock.mockResolvedValue(undefined)
    })

    describe('processPlayCommand — routing', () => {
        it('routes spotify.com URL to spotify handler', async () => {
            handleSpotifyTrackMock.mockResolvedValue(SUCCESS_RESULT)

            await processor.processPlayCommand(
                createOptions('https://open.spotify.com/track/abc'),
            )

            expect(handleSpotifyTrackMock).toHaveBeenCalled()
            expect(handleYouTubeSearchMock).not.toHaveBeenCalled()
        })

        it('routes spotify.com playlist URL to spotify playlist handler', async () => {
            handleSpotifyPlaylistMock.mockResolvedValue(SUCCESS_RESULT)

            await processor.processPlayCommand(
                createOptions('https://open.spotify.com/playlist/abc'),
            )

            expect(handleSpotifyPlaylistMock).toHaveBeenCalled()
        })

        it('routes youtube.com URL to YouTube search', async () => {
            handleYouTubeSearchMock.mockResolvedValue(SUCCESS_RESULT)

            await processor.processPlayCommand(
                createOptions('https://www.youtube.com/watch?v=abc'),
            )

            expect(handleYouTubeSearchMock).toHaveBeenCalled()
            expect(handleSpotifyTrackMock).not.toHaveBeenCalled()
        })

        it('routes youtube.com playlist URL to YouTube playlist handler', async () => {
            handleYouTubePlaylistMock.mockResolvedValue(SUCCESS_RESULT)

            await processor.processPlayCommand(
                createOptions('https://www.youtube.com/playlist?list=abc'),
            )

            expect(handleYouTubePlaylistMock).toHaveBeenCalled()
        })

        it('routes youtu.be short URL to YouTube search', async () => {
            handleYouTubeSearchMock.mockResolvedValue(SUCCESS_RESULT)

            await processor.processPlayCommand(
                createOptions('https://youtu.be/dQw4w9WgXcQ'),
            )

            expect(handleYouTubeSearchMock).toHaveBeenCalled()
        })

        it('routes plain text to Spotify search first, falls back to YouTube', async () => {
            handleSpotifySearchMock.mockResolvedValue({
                success: false,
                error: '',
            })
            handleYouTubeSearchMock.mockResolvedValue(SUCCESS_RESULT)

            await processor.processPlayCommand(
                createOptions('never gonna give you up'),
            )

            expect(handleSpotifySearchMock).toHaveBeenCalled()
            expect(handleYouTubeSearchMock).toHaveBeenCalled()
        })

        it('returns Spotify result without falling back when Spotify search succeeds', async () => {
            handleSpotifySearchMock.mockResolvedValue(SUCCESS_RESULT)

            const result = await processor.processPlayCommand(
                createOptions('never gonna give you up'),
            )

            expect(result.success).toBe(true)
            expect(handleYouTubeSearchMock).not.toHaveBeenCalled()
        })

        it('routes unknown URL (not youtube/spotify) to YouTube search as fallback', async () => {
            handleYouTubeSearchMock.mockResolvedValue(SUCCESS_RESULT)

            await processor.processPlayCommand(
                createOptions('https://soundcloud.com/artist/track'),
            )

            expect(handleYouTubeSearchMock).toHaveBeenCalled()
        })
    })

    describe('processPlayCommand — queue management', () => {
        it('calls manageQueue when result is successful', async () => {
            handleYouTubeSearchMock.mockResolvedValue(SUCCESS_RESULT)

            await processor.processPlayCommand(
                createOptions('https://youtube.com/watch?v=abc'),
            )

            expect(manageQueueMock).toHaveBeenCalledWith(
                expect.anything(),
                SUCCESS_RESULT.tracks,
                SUCCESS_RESULT.isPlaylist,
            )
        })

        it('does not call manageQueue when search fails', async () => {
            handleSpotifySearchMock.mockResolvedValue({
                success: false,
                error: '',
            })
            handleYouTubeSearchMock.mockResolvedValue(FAIL_RESULT)

            await processor.processPlayCommand(createOptions('some song'))

            expect(manageQueueMock).not.toHaveBeenCalled()
        })
    })

    describe('processPlayCommand — error handling', () => {
        it('returns error result when handler throws', async () => {
            handleYouTubeSearchMock.mockRejectedValue(
                new Error('Unexpected crash'),
            )

            const result = await processor.processPlayCommand(
                createOptions('https://youtube.com/watch?v=abc'),
            )

            expect(result.success).toBe(false)
            expect(result.error).toBe('Unexpected crash')
            expect(errorLogMock).toHaveBeenCalled()
        })

        it('returns generic error string for non-Error throws', async () => {
            handleYouTubeSearchMock.mockRejectedValue('string error')

            const result = await processor.processPlayCommand(
                createOptions('https://youtube.com/watch?v=abc'),
            )

            expect(result.success).toBe(false)
            expect(result.error).toBe('Unknown error')
        })
    })
})
