const getSpotifyClientTokenMock = jest.fn()
const getSpotifyArtistMock = jest.fn()
const queueArtistTopTracksMock = jest.fn()
const interactionReplyMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    getSpotifyClientToken: () => getSpotifyClientTokenMock(),
    getSpotifyArtist: (...args: unknown[]) => getSpotifyArtistMock(...args),
}))
jest.mock('../../artist', () => ({
    queueArtistTopTracks: (...args: unknown[]) =>
        queueArtistTopTracksMock(...args),
}))
jest.mock('../../../../../utils/general/interactionReply', () => ({
    interactionReply: (...args: unknown[]) => interactionReplyMock(...args),
}))
jest.mock('../../../../../utils/general/embeds', () => ({
    createErrorEmbed: (title: string, description: string) => ({
        title,
        description,
    }),
}))

import { playSpotifyArtistLink, spotifyArtistId } from './spotifyArtistLink'

describe('spotifyArtistId (#3274)', () => {
    it.each([
        [
            'https://open.spotify.com/artist/0oSGxfWSnnOXhD2fKuz2Gy',
            '0oSGxfWSnnOXhD2fKuz2Gy',
        ],
        [
            'https://open.spotify.com/intl-pt/artist/0oSGxfWSnnOXhD2fKuz2Gy?si=abc',
            '0oSGxfWSnnOXhD2fKuz2Gy',
        ],
        ['  https://open.spotify.com/artist/abc123  ', 'abc123'],
    ])('reads the id from %s', (url, id) => {
        expect(spotifyArtistId(url)).toBe(id)
    })

    it.each([
        'https://open.spotify.com/track/0oSGxfWSnnOXhD2fKuz2Gy',
        'https://evil.example/artist/abc',
        'https://open.spotify.com.evil.example/artist/abc',
        'queen bohemian rhapsody',
    ])('ignores %s', (query) => {
        expect(spotifyArtistId(query)).toBeNull()
    })
})

describe('playSpotifyArtistLink (#3274)', () => {
    const params = {
        client: {} as never,
        interaction: { guildId: 'guild-1' } as never,
        voiceChannel: {} as never,
        artistId: 'abc',
    }

    beforeEach(() => {
        jest.clearAllMocks()
        getSpotifyClientTokenMock.mockResolvedValue('token')
    })

    it('queues the artist top tracks by name', async () => {
        getSpotifyArtistMock.mockResolvedValue({ id: 'abc', name: 'Queen' })

        await playSpotifyArtistLink(params)

        expect(getSpotifyArtistMock).toHaveBeenCalledWith('token', 'abc')
        expect(queueArtistTopTracksMock).toHaveBeenCalledWith(
            expect.objectContaining({ artistName: 'Queen' }),
        )
    })

    it('hands the collaborative reservation to the artist flow (#3269)', async () => {
        getSpotifyArtistMock.mockResolvedValue({ id: 'abc', name: 'Queen' })
        const reservation = { commit: jest.fn(), settle: jest.fn() }

        await playSpotifyArtistLink({ ...params, reservation })

        expect(queueArtistTopTracksMock).toHaveBeenCalledWith(
            expect.objectContaining({ reservation }),
        )
    })

    it('explains when Spotify credentials are missing', async () => {
        getSpotifyClientTokenMock.mockResolvedValue(null)

        await playSpotifyArtistLink(params)

        expect(queueArtistTopTracksMock).not.toHaveBeenCalled()
        expect(interactionReplyMock).toHaveBeenCalledWith(
            expect.objectContaining({
                content: {
                    embeds: [
                        expect.objectContaining({
                            description: expect.stringContaining('/artist'),
                        }),
                    ],
                },
            }),
        )
    })

    it('says so when the artist is not found', async () => {
        getSpotifyArtistMock.mockResolvedValue(null)

        await playSpotifyArtistLink(params)

        expect(queueArtistTopTracksMock).not.toHaveBeenCalled()
        expect(interactionReplyMock).toHaveBeenCalled()
    })
})
