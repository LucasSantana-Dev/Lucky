import { beforeEach, describe, expect, it, jest } from '@jest/globals'

jest.mock('discord-player', () => ({
    QueryType: {
        AUTO: 'AUTO',
        SPOTIFY_SEARCH: 'SPOTIFY_SEARCH',
        SPOTIFY_SONG: 'SPOTIFY_SONG',
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

const searchSpotifyAlbumsMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    errorLog: jest.fn(),
    warnLog: jest.fn(),
    searchSpotifyAlbums: (...args: unknown[]) =>
        searchSpotifyAlbumsMock(...args),
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

import albumCommand from './album'
import { interactionReply } from '../../../utils/general/interactionReply'
import { resolveGuildQueue } from '../../../services/musicManagement/queueResolver'

const ALBUM_URL = 'https://open.spotify.com/album/0ETFjACtuP2ADo6LFhL6HN'

const createTrack = (title: string) => ({
    title,
    author: 'The Beatles',
    url: `https://open.spotify.com/track/${encodeURIComponent(title)}`,
    requestedBy: undefined as unknown,
})

const createInteraction = (query: string, artist: string | null = null) => ({
    guildId: 'guild-1',
    user: { id: 'user-1', username: 'tester' },
    member: { voice: { channel: { id: 'voice-1' } } },
    channel: { id: 'text-1' },
    options: {
        getString: jest.fn((name: string) =>
            name === 'artist' ? artist : query,
        ),
    },
    deferReply: jest.fn(async () => undefined),
})

const lastReply = () =>
    (interactionReply as jest.Mock).mock.calls.at(-1)?.[0] as {
        content: { embeds: { title: string; description?: string }[] }
    }

describe('album command album resolution', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        ;(resolveGuildQueue as jest.Mock).mockReturnValue({
            queue: { addTrack: jest.fn() },
        })
    })

    it('resolves a text query to an album URL before searching', async () => {
        // Pre-fix this query went to SPOTIFY_SEARCH, which can only return
        // tracks, so searchResult.playlist was always null and the command
        // always answered "No album found".
        searchSpotifyAlbumsMock.mockResolvedValue([
            {
                id: 'a1',
                name: 'Abbey Road',
                artist: 'The Beatles',
                url: ALBUM_URL,
            },
        ])
        const search = jest.fn(async () => ({
            tracks: [createTrack('Come Together'), createTrack('Something')],
            playlist: { title: 'Abbey Road' },
        }))
        const play = jest.fn(async () => ({
            track: createTrack('Come Together'),
        }))

        await albumCommand.execute({
            client: { player: { search, play } },
            interaction: createInteraction('Abbey Road'),
        } as never)

        expect(searchSpotifyAlbumsMock).toHaveBeenCalledWith('Abbey Road', 1)
        expect(search).toHaveBeenCalledTimes(1)
        expect(search.mock.calls[0][0]).toBe(ALBUM_URL)
        expect(search.mock.calls[0][1]).toMatchObject({ searchEngine: 'AUTO' })
        expect(lastReply().content.embeds[0].title).not.toBe('No album found')
    })

    it('folds the artist option into the album lookup', async () => {
        searchSpotifyAlbumsMock.mockResolvedValue([
            {
                id: 'a1',
                name: 'Abbey Road',
                artist: 'The Beatles',
                url: ALBUM_URL,
            },
        ])
        const search = jest.fn(async () => ({
            tracks: [createTrack('Come Together')],
            playlist: { title: 'Abbey Road' },
        }))

        await albumCommand.execute({
            client: {
                player: {
                    search,
                    play: jest.fn(async () => ({ track: null })),
                },
            },
            interaction: createInteraction('Abbey Road', 'The Beatles'),
        } as never)

        expect(searchSpotifyAlbumsMock).toHaveBeenCalledWith(
            'Abbey Road The Beatles',
            1,
        )
    })

    it('passes a Spotify album URL straight through without a lookup', async () => {
        const search = jest.fn(async () => ({
            tracks: [createTrack('Come Together')],
            playlist: { title: 'Abbey Road' },
        }))

        await albumCommand.execute({
            client: {
                player: {
                    search,
                    play: jest.fn(async () => ({ track: null })),
                },
            },
            interaction: createInteraction(ALBUM_URL),
        } as never)

        expect(searchSpotifyAlbumsMock).not.toHaveBeenCalled()
        expect(search.mock.calls[0][0]).toBe(ALBUM_URL)
    })

    it('reports an actionable message when no album matches', async () => {
        searchSpotifyAlbumsMock.mockResolvedValue([])
        const search = jest.fn()

        await albumCommand.execute({
            client: { player: { search, play: jest.fn() } },
            interaction: createInteraction('zzzz not an album'),
        } as never)

        expect(search).not.toHaveBeenCalled()
        const embed = lastReply().content.embeds[0]
        expect(embed.title).toBe('No album found')
        // The old copy told users to try "a more specific album search",
        // which no text query could ever satisfy.
        expect(embed.description).not.toContain('more specific album search')
        expect(embed.description).toContain('zzzz not an album')
    })
})
