import { beforeEach, describe, expect, it, jest } from '@jest/globals'

jest.mock('discord-player', () => ({
    QueryType: {
        AUTO: 'AUTO',
        SPOTIFY_SONG: 'SPOTIFY_SONG',
    },
}))

jest.mock('../../../../utils/general/interactionReply', () => ({
    interactionReply: jest.fn(),
}))

jest.mock('../../../../utils/general/embeds', () => ({
    createErrorEmbed: jest.fn((title: string, desc?: string) => ({
        title,
        description: desc,
    })),
    createSuccessEmbed: jest.fn((title: string, desc?: string) => ({
        title,
        description: desc,
    })),
}))

jest.mock('../../../../services/musicManagement/queueResolver', () => ({
    resolveGuildQueue: jest.fn(),
}))

jest.mock('../../../../services/musicManagement/queueManipulation', () => ({
    moveUserTrackToPriority: jest.fn(),
}))

jest.mock('@lucky/shared/utils/general/errorSanitizer', () => ({
    createUserFriendlyError: jest.fn(() => 'User friendly error'),
}))

jest.mock('@lucky/shared/config', () => ({
    ENVIRONMENT_CONFIG: { PLAYER: { CONNECTION_TIMEOUT: 30_000 } },
}))

const getSpotifyClientTokenMock = jest.fn()
const searchSpotifyArtistsMock = jest.fn()
const getSpotifyArtistTopTracksMock = jest.fn()
const getSpotifyArtistAlbumsMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    errorLog: jest.fn(),
    warnLog: jest.fn(),
    getSpotifyClientToken: (...args: unknown[]) =>
        getSpotifyClientTokenMock(...args),
    searchSpotifyArtists: (...args: unknown[]) =>
        searchSpotifyArtistsMock(...args),
    getSpotifyArtistTopTracks: (...args: unknown[]) =>
        getSpotifyArtistTopTracksMock(...args),
    getSpotifyArtistAlbums: (...args: unknown[]) =>
        getSpotifyArtistAlbumsMock(...args),
}))

jest.mock('../play/queryUtils', () => ({
    isUnknownInteractionError: jest.fn(() => false),
}))

import { handleArtistDiscography } from './artistDiscography'
import { interactionReply } from '../../../../utils/general/interactionReply'
import { resolveGuildQueue } from '../../../../services/musicManagement/queueResolver'
import { moveUserTrackToPriority } from '../../../../services/musicManagement/queueManipulation'

const createTrack = (title: string, author: string) => ({
    title,
    author,
    url: `https://example.com/${encodeURIComponent(title)}`,
    requestedBy: undefined as unknown,
})

describe('handleArtistDiscography', () => {
    let addTrack: jest.Mock
    let play: jest.Mock
    let search: jest.Mock
    let interaction: { guildId: string; user: { id: string }; channel: object }
    let client: { player: { search: jest.Mock; play: jest.Mock } }

    beforeEach(() => {
        jest.clearAllMocks()
        getSpotifyClientTokenMock.mockReset()
        searchSpotifyArtistsMock.mockReset()
        getSpotifyArtistTopTracksMock.mockReset()
        getSpotifyArtistAlbumsMock.mockReset()
        addTrack = jest.fn()
        ;(resolveGuildQueue as jest.Mock).mockReturnValue({
            queue: { addTrack },
        })
        play = jest.fn(async () => ({ track: null }))
        search = jest.fn()
        client = { player: { search, play } }
        interaction = {
            guildId: 'guild-1',
            user: { id: 'user-1' },
            channel: { id: 'text-1' },
        }
        getSpotifyClientTokenMock.mockResolvedValue('token-123')
    })

    it('reports an error when Spotify credentials are unconfigured', async () => {
        getSpotifyClientTokenMock.mockResolvedValue(null)

        await handleArtistDiscography({
            client: client as never,
            interaction: interaction as never,
            voiceChannel: {} as never,
            artistName: 'Queen',
        })

        expect(searchSpotifyArtistsMock).not.toHaveBeenCalled()
        const reply = (interactionReply as jest.Mock).mock.calls.at(-1)?.[0]
        expect(reply.content.embeds[0].title).toBe(
            'Discography mode unavailable',
        )
    })

    it('reports no results when no Spotify artist matches', async () => {
        searchSpotifyArtistsMock.mockResolvedValue([])

        await handleArtistDiscography({
            client: client as never,
            interaction: interaction as never,
            voiceChannel: {} as never,
            artistName: 'Some Obscure Name',
        })

        const reply = (interactionReply as jest.Mock).mock.calls.at(-1)?.[0]
        expect(reply.content.embeds[0].title).toBe('No results')
        expect(getSpotifyArtistTopTracksMock).not.toHaveBeenCalled()
    })

    it('prefers the exact-name match over other search results', async () => {
        searchSpotifyArtistsMock.mockResolvedValue([
            { id: 'wrong-id', name: 'Queen Latifah' },
            { id: 'right-id', name: 'Queen' },
        ])
        getSpotifyArtistTopTracksMock.mockResolvedValue([])
        getSpotifyArtistAlbumsMock.mockResolvedValue([])

        await handleArtistDiscography({
            client: client as never,
            interaction: interaction as never,
            voiceChannel: {} as never,
            artistName: 'queen',
        })

        expect(getSpotifyArtistTopTracksMock).toHaveBeenCalledWith(
            'token-123',
            'right-id',
        )
    })

    it('queues top tracks then album tracks, deduped, most famous first', async () => {
        searchSpotifyArtistsMock.mockResolvedValue([
            { id: 'artist-1', name: 'Queen' },
        ])
        getSpotifyArtistTopTracksMock.mockResolvedValue([
            {
                name: 'Bohemian Rhapsody',
                artist: 'Queen',
                url: 'spotify:top:1',
            },
        ])
        getSpotifyArtistAlbumsMock.mockResolvedValue([
            {
                id: 'album-1',
                name: 'A Night at the Opera',
                url: 'spotify:album:1',
            },
        ])

        // Top track resolve call, then album resolve call.
        search
            .mockResolvedValueOnce({
                tracks: [createTrack('Bohemian Rhapsody', 'Queen')],
            })
            .mockResolvedValueOnce({
                tracks: [
                    // Same song as the top track — must be deduped.
                    createTrack('Bohemian Rhapsody', 'Queen'),
                    createTrack('Death on Two Legs', 'Queen'),
                ],
            })
        play.mockResolvedValueOnce({
            track: createTrack('Bohemian Rhapsody', 'Queen'),
        })

        await handleArtistDiscography({
            client: client as never,
            interaction: interaction as never,
            voiceChannel: {} as never,
            artistName: 'Queen',
        })

        expect(play).toHaveBeenCalledTimes(1)
        expect(play.mock.calls[0][1]).toContain('Bohemian%20Rhapsody')
        expect(addTrack).toHaveBeenCalledTimes(1)
        expect((addTrack.mock.calls[0][0] as { title: string }).title).toBe(
            'Death on Two Legs',
        )
        expect(moveUserTrackToPriority).toHaveBeenCalled()

        const reply = (interactionReply as jest.Mock).mock.calls.at(-1)?.[0]
        expect(reply.content.embeds[0].description).toContain('**2**')
    })

    it('reports no results when nothing resolves to a playable track', async () => {
        searchSpotifyArtistsMock.mockResolvedValue([
            { id: 'artist-1', name: 'Queen' },
        ])
        getSpotifyArtistTopTracksMock.mockResolvedValue([
            {
                name: 'Bohemian Rhapsody',
                artist: 'Queen',
                url: 'spotify:top:1',
            },
        ])
        getSpotifyArtistAlbumsMock.mockResolvedValue([])
        search.mockResolvedValue({ tracks: [] })

        await handleArtistDiscography({
            client: client as never,
            interaction: interaction as never,
            voiceChannel: {} as never,
            artistName: 'Queen',
        })

        expect(play).not.toHaveBeenCalled()
        const reply = (interactionReply as jest.Mock).mock.calls.at(-1)?.[0]
        expect(reply.content.embeds[0].title).toBe('No results')
    })

    it('continues past a rejecting album resolve instead of failing the whole command', async () => {
        searchSpotifyArtistsMock.mockResolvedValue([
            { id: 'artist-1', name: 'Queen' },
        ])
        getSpotifyArtistTopTracksMock.mockResolvedValue([])
        getSpotifyArtistAlbumsMock.mockResolvedValue([
            { id: 'album-1', name: 'Bad Album', url: 'spotify:album:bad' },
            { id: 'album-2', name: 'Good Album', url: 'spotify:album:good' },
        ])
        search
            .mockRejectedValueOnce(new Error('extractor down'))
            .mockResolvedValueOnce({
                tracks: [createTrack('Somebody To Love', 'Queen')],
            })

        await handleArtistDiscography({
            client: client as never,
            interaction: interaction as never,
            voiceChannel: {} as never,
            artistName: 'Queen',
        })

        expect(play).toHaveBeenCalledTimes(1)
        const reply = (interactionReply as jest.Mock).mock.calls.at(-1)?.[0]
        expect(reply.content.embeds[0].description).toContain('**1**')
    })
})
