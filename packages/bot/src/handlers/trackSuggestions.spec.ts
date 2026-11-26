const searchSpotifyTracksMock = jest.fn()
const getSpotifyClientTokenMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    getSpotifyClientToken: () => getSpotifyClientTokenMock(),
    searchSpotifyTracks: (...a: unknown[]) => searchSpotifyTracksMock(...a),
}))

import { resetTrackSuggestions, suggestTracks } from './trackSuggestions'

const track = (id: string, name = `Song ${id}`, artist = 'Artist') => ({
    name,
    artist,
    url: `https://open.spotify.com/track/${id}`,
})

describe('track suggestions for /search', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        jest.useRealTimers()
        resetTrackSuggestions()
        getSpotifyClientTokenMock.mockResolvedValue('client-token')
    })

    it('offers each match by name and artist, valued with its track URL', async () => {
        searchSpotifyTracksMock.mockResolvedValue([
            track('t1', 'Creep', 'Radiohead'),
            track('t2', 'Creep', 'TLC'),
        ])

        await expect(suggestTracks('  creep ')).resolves.toEqual([
            {
                name: 'Creep, Radiohead',
                value: 'https://open.spotify.com/track/t1',
            },
            { name: 'Creep, TLC', value: 'https://open.spotify.com/track/t2' },
        ])
        expect(searchSpotifyTracksMock).toHaveBeenCalledWith(
            'client-token',
            'creep',
            10,
            expect.any(AbortSignal),
        )
    })

    it.each(['ab', '   ', 'https://open.spotify.com/track/t1'])(
        'offers nothing for %p without searching',
        async (typed) => {
            await expect(suggestTracks(typed)).resolves.toEqual([])
            expect(searchSpotifyTracksMock).not.toHaveBeenCalled()
        },
    )

    it('keeps a choice name within the Discord limit', async () => {
        searchSpotifyTracksMock.mockResolvedValue([
            track('t1', 'x'.repeat(150)),
        ])

        const [choice] = await suggestTracks('long title')

        expect(choice.name).toHaveLength(100)
    })

    it('shortens a long title and still shows the artist', async () => {
        searchSpotifyTracksMock.mockResolvedValue([
            track('t1', 'x'.repeat(150), 'Radiohead'),
        ])

        const [choice] = await suggestTracks('long title')

        expect(choice.name.length).toBeLessThanOrEqual(100)
        expect(choice.name.endsWith('\u2026, Radiohead')).toBe(true)
    })

    it('drops a repeated track URL', async () => {
        searchSpotifyTracksMock.mockResolvedValue([track('t1'), track('t1')])

        await expect(suggestTracks('song')).resolves.toHaveLength(1)
    })

    it('answers the same text from cache, whatever its case or spacing', async () => {
        searchSpotifyTracksMock.mockResolvedValue([track('t1')])

        await suggestTracks('Daft  Punk')
        await suggestTracks('daft punk')

        expect(searchSpotifyTracksMock).toHaveBeenCalledTimes(1)
    })

    it('asks again after an empty answer', async () => {
        searchSpotifyTracksMock.mockResolvedValueOnce([])
        searchSpotifyTracksMock.mockResolvedValueOnce([track('t1')])

        await expect(suggestTracks('daft punk')).resolves.toEqual([])
        await expect(suggestTracks('daft punk')).resolves.toHaveLength(1)
    })

    it('offers nothing without a Spotify token', async () => {
        getSpotifyClientTokenMock.mockResolvedValue(null)

        await expect(suggestTracks('daft punk')).resolves.toEqual([])
        expect(searchSpotifyTracksMock).not.toHaveBeenCalled()
    })

    it('offers nothing when the lookup is slower than Discord allows', async () => {
        jest.useFakeTimers()
        searchSpotifyTracksMock.mockReturnValue(new Promise(() => undefined))

        const pending = suggestTracks('slow song')
        await jest.advanceTimersByTimeAsync(2500)

        await expect(pending).resolves.toEqual([])
        const signal = searchSpotifyTracksMock.mock.calls[0][3] as AbortSignal
        expect(signal.aborted).toBe(true)
    })
})
