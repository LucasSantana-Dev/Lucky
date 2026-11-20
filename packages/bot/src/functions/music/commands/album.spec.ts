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

const createInteraction = (
    query: string,
    artist: string | null = null,
    flags: Record<string, boolean> = {},
) => ({
    guildId: 'guild-1',
    user: { id: 'user-1', username: 'tester' },
    member: { voice: { channel: { id: 'voice-1' } } },
    channel: { id: 'text-1' },
    options: {
        getString: jest.fn((name: string) =>
            name === 'artist' ? artist : query,
        ),
        getBoolean: jest.fn((name: string) => flags[name] ?? null),
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
        const search = jest.fn(async (..._a: unknown[]) => ({
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

        expect(searchSpotifyAlbumsMock).toHaveBeenCalledWith('Abbey Road', 20)
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
        const search = jest.fn(async (..._a: unknown[]) => ({
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
            20,
        )
    })

    it('picks the album by the named artist over the first hit', async () => {
        const wanted = 'https://open.spotify.com/album/anavitoria'
        searchSpotifyAlbumsMock.mockResolvedValue([
            {
                id: 'dj',
                name: 'Esquinas',
                artist: 'Djavan',
                url: 'https://open.spotify.com/album/djavan',
            },
            { id: 'av', name: 'Esquinas', artist: 'ANAVITÓRIA', url: wanted },
        ])
        const search = jest.fn(async (..._a: unknown[]) => ({
            tracks: [createTrack('Lisboa')],
            playlist: { title: 'Esquinas' },
        }))

        await albumCommand.execute({
            client: {
                player: {
                    search,
                    play: jest.fn(async () => ({ track: null })),
                },
            },
            interaction: createInteraction('Esquinas', 'Anavitória'),
        } as never)

        expect(search.mock.calls[0][0]).toBe(wanted)
    })

    it('keeps the first hit when no album name matches the request', async () => {
        searchSpotifyAlbumsMock.mockResolvedValue([
            {
                id: 'a1',
                name: 'Abbey Road (Remastered)',
                artist: 'The Beatles',
                url: ALBUM_URL,
            },
        ])
        const search = jest.fn(async (..._a: unknown[]) => ({
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
            interaction: createInteraction('abbey road'),
        } as never)

        expect(search.mock.calls[0][0]).toBe(ALBUM_URL)
    })

    it('passes a Spotify album URL straight through without a lookup', async () => {
        const search = jest.fn(async (..._a: unknown[]) => ({
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

    it('links the first track back to the album before it starts', async () => {
        const playlist = { title: 'Abbey Road' }
        const playedTrack = { ...createTrack('Come Together'), playlist: null }
        let linkedBeforeStart: unknown

        await albumCommand.execute({
            client: {
                player: {
                    search: jest.fn(async () => ({
                        tracks: [createTrack('Come Together')],
                        playlist,
                    })),
                    // discord-player runs afterSearch, then starts the track
                    // (and now playing) before play() resolves.
                    play: jest.fn(async (_channel, _query, options) => {
                        await options.afterSearch({ tracks: [playedTrack] })
                        linkedBeforeStart = playedTrack.playlist
                        return { track: playedTrack }
                    }),
                },
            },
            interaction: createInteraction(ALBUM_URL),
        } as never)

        expect(linkedBeforeStart).toBe(playlist)
    })

    it('turns on autocomplete for the query option', () => {
        const query = albumCommand.data
            .toJSON()
            .options?.find((option) => option.name === 'query') as {
            autocomplete?: boolean
        }

        expect(query.autocomplete).toBe(true)
    })

    it('shuffles the album when the shuffle option is on', async () => {
        const titles = ['One', 'Two', 'Three', 'Four']
        const search = jest.fn(async (..._a: unknown[]) => ({
            tracks: titles.map(createTrack),
            playlist: { title: 'Abbey Road' },
        }))
        const play = jest.fn(async () => ({ track: null }))
        const addTrack = jest.fn()
        ;(resolveGuildQueue as jest.Mock).mockReturnValue({
            queue: { addTrack },
        })
        const random = jest.spyOn(Math, 'random').mockReturnValue(0)

        await albumCommand.execute({
            client: { player: { search, play } },
            interaction: createInteraction(ALBUM_URL, null, { shuffle: true }),
        } as never)
        random.mockRestore()

        const played = [
            decodeURIComponent(
                (play.mock.calls[0] as unknown[])[1] as string,
            ).split('/track/')[1],
            ...addTrack.mock.calls.map(
                ([track]) => (track as { title: string }).title,
            ),
        ]
        // What Fisher-Yates gives with random pinned to 0: the played track
        // moves too, not just the queued ones.
        expect(played).toEqual(['Two', 'Three', 'Four', 'One'])
        expect(lastReply().content.embeds[0].description).toContain('Shuffled')
    })

    it('puts the album at the front of the queue with the next option', async () => {
        const first = createTrack('One')
        const rest = [createTrack('Two'), createTrack('Three')]
        const search = jest.fn(async (..._a: unknown[]) => ({
            tracks: [first, ...rest],
            playlist: { title: 'Abbey Road' },
        }))
        // Something else is playing, so the first album track lands at the
        // end of the queue.
        const play = jest.fn(async () => ({ track: first }))
        const queue = {
            tracks: { toArray: () => [createTrack('Older'), first] },
            node: { remove: jest.fn() },
            insertTrack: jest.fn(),
            addTrack: jest.fn(),
        }
        ;(resolveGuildQueue as jest.Mock).mockReturnValue({ queue })

        await albumCommand.execute({
            client: { player: { search, play } },
            interaction: createInteraction(ALBUM_URL, null, { next: true }),
        } as never)

        expect(queue.node.remove).toHaveBeenCalledWith(first)
        expect(queue.insertTrack.mock.calls).toEqual([
            [first, 0],
            [rest[0], 1],
            [rest[1], 2],
        ])
        expect(queue.addTrack).not.toHaveBeenCalled()
        expect(lastReply().content.embeds[0].description).toContain(
            'Playing next',
        )
    })

    it('starts the next album at position 0 when its first track is already playing', async () => {
        const first = createTrack('One')
        const second = createTrack('Two')
        const queue = {
            tracks: { toArray: () => [] },
            node: { remove: jest.fn() },
            insertTrack: jest.fn(),
            addTrack: jest.fn(),
        }
        ;(resolveGuildQueue as jest.Mock).mockReturnValue({ queue })

        await albumCommand.execute({
            client: {
                player: {
                    search: jest.fn(async () => ({
                        tracks: [first, second],
                        playlist: { title: 'Abbey Road' },
                    })),
                    play: jest.fn(async () => ({ track: first })),
                },
            },
            interaction: createInteraction(ALBUM_URL, null, { next: true }),
        } as never)

        expect(queue.node.remove).not.toHaveBeenCalled()
        expect(queue.insertTrack.mock.calls).toEqual([[second, 0]])
    })

    it('counts only the tracks left after the ASMR filter (#3001)', async () => {
        const asmr = { ...createTrack('Rain ASMR'), author: 'Sleepy' }
        const addTrack = jest.fn()
        ;(resolveGuildQueue as jest.Mock).mockReturnValue({
            queue: { addTrack },
        })
        const search = jest.fn(async (..._a: unknown[]) => ({
            tracks: [
                createTrack('Come Together'),
                asmr,
                createTrack('Something'),
            ],
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

        expect(addTrack).toHaveBeenCalledTimes(1)
        expect(addTrack).not.toHaveBeenCalledWith(asmr)
        expect(lastReply().content.embeds[0].description).toContain('**2**')
    })

    it('says ASMR is blocked when the whole album is ASMR (#3001)', async () => {
        const play = jest.fn()
        const search = jest.fn(async (..._a: unknown[]) => ({
            tracks: [{ ...createTrack('Rain ASMR'), author: 'Sleepy' }],
            playlist: { title: 'Sleep' },
        }))

        await albumCommand.execute({
            client: { player: { search, play } },
            interaction: createInteraction(ALBUM_URL),
        } as never)

        expect(play).not.toHaveBeenCalled()
        expect(lastReply().content.embeds[0].description).toContain('ASMR')
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
