import { beforeEach, describe, expect, it, jest } from '@jest/globals'

jest.mock('discord-player', () => ({
    QueryType: {
        AUTO: 'AUTO',
        SPOTIFY_SEARCH: 'SPOTIFY_SEARCH',
        SPOTIFY_SONG: 'SPOTIFY_SONG',
        YOUTUBE_SEARCH: 'YOUTUBE_SEARCH',
        SOUNDCLOUD_SEARCH: 'SOUNDCLOUD_SEARCH',
    },
}))

jest.mock('../../../utils/general/interactionReply', () => ({
    interactionReply: jest.fn(),
}))

jest.mock('../../../utils/general/embeds', () => ({
    createErrorEmbed: jest.fn((title: string, desc?: string) => ({
        title,
        description: desc,
    })),
    createSuccessEmbed: jest.fn((title: string, desc?: string) => ({
        title,
        description: desc,
    })),
    createWarningEmbed: jest.fn((title: string, desc?: string) => ({
        title,
        description: desc,
    })),
}))

jest.mock('../../../services/musicManagement/queueResolver', () => ({
    resolveGuildQueue: jest.fn(),
}))

jest.mock('../../../services/musicManagement/queueManipulation', () => ({
    moveUserTrackToPriority: jest.fn(),
}))

jest.mock('@lucky/shared/utils/general/errorSanitizer', () => ({
    createUserFriendlyError: jest.fn(() => 'User friendly error'),
}))

jest.mock('../../../utils/command/commandValidations', () => ({
    requireVoiceChannel: jest.fn(async () => true),
    requireDJRole: jest.fn(async () => true),
}))

jest.mock('@lucky/shared/utils', () => ({
    errorLog: jest.fn(),
    warnLog: jest.fn(),
}))

jest.mock('@lucky/shared/utils/guards', () => ({
    assertDefined: jest.fn((value: unknown) => value),
}))

jest.mock('@lucky/shared/config', () => ({
    ENVIRONMENT_CONFIG: { PLAYER: { CONNECTION_TIMEOUT: 30_000 } },
}))

jest.mock('@lucky/shared/services', () => ({
    featureToggleService: { isEnabled: jest.fn(async () => true) },
}))

import artistCommand from './artist'
import { interactionReply } from '../../../utils/general/interactionReply'
import { resolveGuildQueue } from '../../../services/musicManagement/queueResolver'

const createTrack = (title: string, author: string) => ({
    title,
    author,
    url: `https://example.com/${encodeURIComponent(title)}`,
    requestedBy: undefined as unknown,
})

const createInteraction = () => ({
    guildId: 'guild-1',
    user: { id: 'user-1', username: 'tester' },
    member: { voice: { channel: { id: 'voice-1' } } },
    channel: { id: 'text-1' },
    options: {
        getString: jest.fn(() => 'Queen'),
        getInteger: jest.fn(() => null),
    },
    deferReply: jest.fn(async () => undefined),
})

describe('artist command search fallback', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        ;(resolveGuildQueue as jest.Mock).mockReturnValue({
            queue: { addTrack: jest.fn() },
        })
    })

    it('falls back past an empty Spotify arm instead of reporting "no tracks found"', async () => {
        const queenTracks = [
            createTrack('Bohemian Rhapsody', 'Queen'),
            createTrack('We Will Rock You', 'Queen'),
            createTrack("Don't Stop Me Now", 'Queen'),
        ]
        // Reproduces the reported bug: SpotifyAPI.search() swallows its error
        // and yields an empty result, so the Spotify arm returns zero tracks.
        const search = jest
            .fn()
            .mockResolvedValueOnce({ tracks: [] })
            .mockResolvedValueOnce({ tracks: queenTracks })
        const play = jest.fn(async () => ({ track: queenTracks[0] }))
        const interaction = createInteraction()

        await artistCommand.execute({
            client: { player: { search, play } },
            interaction,
        } as never)

        expect(search).toHaveBeenCalledTimes(2)
        expect(search.mock.calls[0][1]).toMatchObject({
            searchEngine: 'SPOTIFY_SEARCH',
        })
        expect(search.mock.calls[1][1]).toMatchObject({
            searchEngine: 'YOUTUBE_SEARCH',
        })

        const reply = (interactionReply as jest.Mock).mock.calls.at(-1)?.[0]
        expect(reply.content.embeds[0].title).toBe('🎤 Queen')
        expect(reply.content.embeds[0].description).toContain('**3**')
    })

    it('plays a non-Spotify fallback track with AUTO rather than SPOTIFY_SONG', async () => {
        const search = jest
            .fn()
            .mockResolvedValueOnce({ tracks: [] })
            .mockResolvedValueOnce({
                tracks: [createTrack('We Are The Champions', 'Queen')],
            })
        const play = jest.fn(async () => ({ track: null }))

        await artistCommand.execute({
            client: { player: { search, play } },
            interaction: createInteraction(),
        } as never)

        expect(play.mock.calls[0][2]).toMatchObject({
            searchEngine: 'AUTO',
        })
    })

    it('reports no results only after every arm is exhausted', async () => {
        const search = jest.fn(async () => ({ tracks: [] }))

        await artistCommand.execute({
            client: { player: { search, play: jest.fn() } },
            interaction: createInteraction(),
        } as never)

        expect(search).toHaveBeenCalledTimes(3)
        const reply = (interactionReply as jest.Mock).mock.calls.at(-1)?.[0]
        expect(reply.content.embeds[0].title).toBe('No results')
    })

    it('continues to the next arm when an arm rejects', async () => {
        const search = jest
            .fn()
            .mockRejectedValueOnce(new Error('spotify token dead'))
            .mockResolvedValueOnce({ tracks: [] })
            .mockResolvedValueOnce({
                tracks: [createTrack('Somebody To Love', 'Queen')],
            })
        const play = jest.fn(async () => ({ track: null }))

        await artistCommand.execute({
            client: { player: { search, play } },
            interaction: createInteraction(),
        } as never)

        expect(search).toHaveBeenCalledTimes(3)
        expect(search.mock.calls[2][1]).toMatchObject({
            searchEngine: 'SOUNDCLOUD_SEARCH',
        })
        expect(play).toHaveBeenCalled()
    })
})
