jest.mock('../../../../../src/functions/music/commands/play/youtubeHandler', () => ({
    handleSpotifySearch: jest.fn(),
    handleYouTubeSearch: jest.fn(),
    handleYouTubePlaylist: jest.fn(),
}))

jest.mock('../../../../../src/functions/music/commands/play/spotifyHandler', () => ({
    handleSpotifyTrack: jest.fn(),
    handleSpotifyPlaylist: jest.fn(),
}))

jest.mock('../../../../../src/functions/music/commands/play/queueManager', () => ({
    manageQueue: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
    errorLog: jest.fn(),
    warnLog: jest.fn(),
}))

import { PlayCommandProcessor } from '../../../../../src/functions/music/commands/play/processor'
import {
    handleSpotifySearch,
    handleYouTubeSearch,
} from '../../../../../src/functions/music/commands/play/youtubeHandler'

const makeOptions = (query: string) => ({
    query,
    user: { id: 'user-1' } as any,
    guildId: 'guild-1',
    channelId: 'channel-1',
    player: {} as any,
    queue: {} as any,
})

describe('PlayCommandProcessor.processPlayCommand', () => {
    let processor: PlayCommandProcessor

    beforeEach(() => {
        jest.clearAllMocks()
        processor = new PlayCommandProcessor()
    })

    describe('handleSearchQuery (plain text queries)', () => {
        it('returns Spotify result directly when Spotify search succeeds', async () => {
            const tracks = [{ title: 'Spotify Track' }] as any[]
            ;(handleSpotifySearch as jest.Mock).mockResolvedValue({
                success: true,
                tracks,
                isPlaylist: false,
            })

            const result = await processor.processPlayCommand(
                makeOptions('some song'),
            )

            expect(result.success).toBe(true)
            expect(result.tracks).toBe(tracks)
            expect(handleYouTubeSearch).not.toHaveBeenCalled()
        })

        it('falls back to YouTube when Spotify search returns no results', async () => {
            const tracks = [{ title: 'YT Track' }] as any[]
            ;(handleSpotifySearch as jest.Mock).mockResolvedValue({
                success: false,
                error: '',
            })
            ;(handleYouTubeSearch as jest.Mock).mockResolvedValue({
                success: true,
                tracks,
                isPlaylist: false,
            })

            const result = await processor.processPlayCommand(
                makeOptions('some song'),
            )

            expect(result.success).toBe(true)
            expect(result.tracks).toBe(tracks)
            expect(handleYouTubeSearch).toHaveBeenCalledWith(
                'some song',
                expect.anything(),
                'guild-1',
                'channel-1',
                expect.anything(),
            )
        })
    })
})
