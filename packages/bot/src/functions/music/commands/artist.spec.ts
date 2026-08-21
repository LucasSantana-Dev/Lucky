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
import { warnLog } from '@lucky/shared/utils'

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

        // The diagnostics are the point of this change: without them a
        // recurrence is invisible in Loki again.
        expect(warnLog).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Artist search arm returned no tracks',
                data: expect.objectContaining({ engine: 'SPOTIFY_SEARCH' }),
            }),
        )
    })

    it('keeps only the artist match even when fewer than three tracks match', async () => {
        // Production 2026-08-21: Spotify's results for "queen" included
        // "Queencard" by i-dle. The old `>= 3` threshold dropped the author
        // filter whenever under three tracks matched, so the raw search order
        // was queued and a K-pop track played after Bohemian Rhapsody.
        const search = jest.fn(async () => ({
            tracks: [
                createTrack('Bohemian Rhapsody', 'Queen'),
                createTrack('Queencard', 'i-dle'),
                createTrack('Queen of Hearts', 'Fleetwood Mac'),
                createTrack('Dancing Queen', 'ABBA'),
            ],
        }))
        const addTrack = jest.fn()
        ;(resolveGuildQueue as jest.Mock).mockReturnValue({
            queue: { addTrack },
        })
        const play = jest.fn(async () => ({ track: null }))

        await artistCommand.execute({
            client: { player: { search, play } },
            interaction: createInteraction(),
        } as never)

        // Only the one Queen track is queued; nothing by i-dle, Fleetwood Mac
        // or ABBA reaches the queue or the first-play slot.
        expect(play.mock.calls[0][1]).toContain('Bohemian%20Rhapsody')
        const queuedAuthors = addTrack.mock.calls.map(
            ([t]) => (t as { author: string }).author,
        )
        expect(queuedAuthors).toEqual([])
    })

    it('does not let a single fuzzy match hijack the queue', async () => {
        // cubic P2 on #2052: wordMatch tokenises the author, so "Prince Royce"
        // matches /artist prince on one token. Trusting one fuzzy hit would
        // confidently queue the wrong artist — the exact case the original
        // >= 3 threshold existed to prevent.
        const search = jest.fn(async () => ({
            tracks: [
                createTrack('Darte un Beso', 'Prince Royce'),
                createTrack('Unrelated', 'Someone Else'),
                createTrack('Another', 'Third Party'),
            ],
        }))
        const addTrack = jest.fn()
        ;(resolveGuildQueue as jest.Mock).mockReturnValue({
            queue: { addTrack },
        })
        const play = jest.fn(async () => ({ track: null }))
        const interaction = createInteraction()
        interaction.options.getString = jest.fn(() => 'Prince')

        await artistCommand.execute({
            client: { player: { search, play } },
            interaction,
        } as never)

        // One wordMatch is not enough, so it falls through to the raw results
        // rather than presenting Prince Royce as if it were Prince.
        expect(addTrack).toHaveBeenCalledTimes(2)
    })

    it('falls back to raw results only when nothing matches the artist', async () => {
        const search = jest.fn(async () => ({
            tracks: [
                createTrack('Some Song', 'Totally Different'),
                createTrack('Another', 'Also Different'),
            ],
        }))
        const addTrack = jest.fn()
        ;(resolveGuildQueue as jest.Mock).mockReturnValue({
            queue: { addTrack },
        })
        const play = jest.fn(async () => ({ track: null }))

        await artistCommand.execute({
            client: { player: { search, play } },
            interaction: createInteraction(),
        } as never)

        // No author matched, so the raw order is still used rather than
        // reporting nothing — this covers misspellings and odd metadata.
        expect(play).toHaveBeenCalled()
        expect(addTrack).toHaveBeenCalledTimes(1)
    })

    it('plays a Spotify-resolved track with SPOTIFY_SONG', async () => {
        const search = jest.fn(async () => ({
            tracks: [createTrack('Bohemian Rhapsody', 'Queen')],
        }))
        const play = jest.fn(async () => ({ track: null }))

        await artistCommand.execute({
            client: { player: { search, play } },
            interaction: createInteraction(),
        } as never)

        expect(search).toHaveBeenCalledTimes(1)
        expect(play.mock.calls[0][2]).toMatchObject({
            searchEngine: 'SPOTIFY_SONG',
        })
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

    it('logs a rejecting arm as thrown, not as an empty result', async () => {
        const search = jest
            .fn()
            .mockRejectedValueOnce(new Error('spotify token dead'))
            .mockResolvedValueOnce({
                tracks: [createTrack('Somebody To Love', 'Queen')],
            })

        await artistCommand.execute({
            client: { player: { search, play: jest.fn(async () => ({})) } },
            interaction: createInteraction(),
        } as never)

        const logged = (warnLog as jest.Mock).mock.calls.map(
            ([params]) =>
                params as { message: string; data: { engine: string } },
        )
        const spotifyLogs = logged.filter(
            (l) => l.data.engine === 'SPOTIFY_SEARCH',
        )
        expect(spotifyLogs).toHaveLength(1)
        expect(spotifyLogs[0].message).toBe('Artist search arm threw')
    })
})
