import { QueryType } from 'discord-player'
import { handleSpotifySearch } from '../../../../../src/functions/music/commands/play/youtubeHandler'

jest.mock('discord-player', () => ({
    QueryType: { SPOTIFY_SEARCH: 'spotifySearch' },
}))

jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
    warnLog: jest.fn(),
    errorLog: jest.fn(),
}))

const makePlayer = (searchResult: unknown) => ({
    search: jest.fn().mockResolvedValue(searchResult),
})

const makeUser = () => ({ id: 'user-1' } as any)

describe('handleSpotifySearch', () => {
    beforeEach(() => jest.clearAllMocks())

    it('returns success with tracks when Spotify search finds results', async () => {
        const tracks = [{ title: 'Track A' }, { title: 'Track B' }]
        const player = makePlayer({ hasTracks: () => true, tracks })
        const user = makeUser()

        const result = await handleSpotifySearch(
            'some song',
            user,
            'guild-1',
            'channel-1',
            player as any,
        )

        expect(result.success).toBe(true)
        expect(result.tracks).toBe(tracks)
        expect(result.isPlaylist).toBe(false)
        expect(player.search).toHaveBeenCalledWith('some song', {
            requestedBy: user,
            searchEngine: QueryType.SPOTIFY_SEARCH,
        })
    })

    it('returns success=false when Spotify search returns no tracks', async () => {
        const player = makePlayer({ hasTracks: () => false, tracks: [] })

        const result = await handleSpotifySearch(
            'unknown track',
            makeUser(),
            'guild-1',
            'channel-1',
            player as any,
        )

        expect(result.success).toBe(false)
        expect(result.tracks).toBeUndefined()
    })

    it('returns success=false and logs warning when search throws', async () => {
        const { warnLog } = await import('@lucky/shared/utils')
        const player = {
            search: jest.fn().mockRejectedValue(new Error('Spotify API down')),
        }

        const result = await handleSpotifySearch(
            'any query',
            makeUser(),
            'guild-2',
            'channel-2',
            player as any,
        )

        expect(result.success).toBe(false)
        expect(warnLog).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Spotify search failed, falling back to YouTube',
            }),
        )
    })
})
