import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    jest,
} from '@jest/globals'
import { getLastFmSeedTracks } from './lastFmSeeds'

const getByDiscordIdMock = jest.fn()
const getTopTracksMock = jest.fn()

jest.mock('@lucky/shared/services', () => ({
    lastFmLinkService: {
        getByDiscordId: (...args: unknown[]) => getByDiscordIdMock(...args),
    },
}))

jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
    errorLog: jest.fn(),
}))

jest.mock('../../../lastfm', () => ({
    getTopTracks: (...args: unknown[]) => getTopTracksMock(...args),
}))

describe('getLastFmSeedTracks', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    it('returns mapped tracks when user has a Last.fm link', async () => {
        getByDiscordIdMock.mockResolvedValue({ lastFmUsername: 'user123' })
        getTopTracksMock.mockResolvedValue([
            { artist: 'Artist A', title: 'Song A', playCount: 10 },
            { artist: 'Artist B', title: 'Song B', playCount: 5 },
        ])

        const tracks = await getLastFmSeedTracks('discord-user-1')

        expect(tracks).toEqual([
            { artist: 'Artist A', title: 'Song A' },
            { artist: 'Artist B', title: 'Song B' },
        ])
        expect(getTopTracksMock).toHaveBeenCalledWith('user123', '3month', 20)
    })

    it('returns empty array when user has no Last.fm link', async () => {
        getByDiscordIdMock.mockResolvedValue(null)

        const tracks = await getLastFmSeedTracks('discord-user-2')

        expect(tracks).toEqual([])
        expect(getTopTracksMock).not.toHaveBeenCalled()
    })

    it('returns empty array when link has no lastFmUsername', async () => {
        getByDiscordIdMock.mockResolvedValue({ lastFmUsername: null })

        const tracks = await getLastFmSeedTracks('discord-user-3')

        expect(tracks).toEqual([])
    })

    it('returns cached result on second call within TTL', async () => {
        getByDiscordIdMock.mockResolvedValue({ lastFmUsername: 'cached-user' })
        getTopTracksMock.mockResolvedValue([
            { artist: 'Artist C', title: 'Song C', playCount: 3 },
        ])

        const first = await getLastFmSeedTracks('discord-user-cache')
        const second = await getLastFmSeedTracks('discord-user-cache')

        expect(first).toEqual(second)
        expect(getTopTracksMock).toHaveBeenCalledTimes(1)
    })

    it('returns empty array when getTopTracks throws', async () => {
        getByDiscordIdMock.mockResolvedValue({ lastFmUsername: 'erruser' })
        getTopTracksMock.mockRejectedValue(new Error('API error'))

        const tracks = await getLastFmSeedTracks('discord-user-err')

        expect(tracks).toEqual([])
    })
})
