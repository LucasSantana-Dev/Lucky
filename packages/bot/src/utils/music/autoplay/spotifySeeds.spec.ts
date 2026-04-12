import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    jest,
} from '@jest/globals'
import {
    getSpotifySeedTracks,
    getSpotifySeedSlice,
    advanceSpotifySeedOffset,
    getSpotifyCacheOffset,
    consumeSpotifySeedSlice,
    SPOTIFY_SEED_COUNT,
} from './spotifySeeds'

const getValidAccessTokenMock = jest.fn()
const getUserTopTracksMock = jest.fn()
const getUserSavedTracksMock = jest.fn()

jest.mock('@lucky/shared/services', () => ({
    spotifyLinkService: {
        getValidAccessToken: (...args: unknown[]) =>
            getValidAccessTokenMock(...args),
    },
}))

jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
    errorLog: jest.fn(),
}))

jest.mock('../../../spotify/spotifyApi', () => ({
    getUserTopTracks: (...args: unknown[]) => getUserTopTracksMock(...args),
    getUserSavedTracks: (...args: unknown[]) => getUserSavedTracksMock(...args),
}))

describe('getSpotifySeedTracks', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        getUserSavedTracksMock.mockResolvedValue([])
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    it('returns mapped tracks when user has valid access token', async () => {
        getValidAccessTokenMock.mockResolvedValue('valid-token')
        getUserTopTracksMock.mockResolvedValue([
            { artist: 'Artist A', title: 'Song A' },
            { artist: 'Artist B', title: 'Song B' },
        ])

        const tracks = await getSpotifySeedTracks('user-1')

        expect(tracks).toEqual([
            { artist: 'Artist A', title: 'Song A' },
            { artist: 'Artist B', title: 'Song B' },
        ])
        expect(getValidAccessTokenMock).toHaveBeenCalledWith('user-1')
    })

    it('returns empty array when user has no access token', async () => {
        getValidAccessTokenMock.mockResolvedValue(null)

        const tracks = await getSpotifySeedTracks('user-2')

        expect(tracks).toEqual([])
        expect(getUserTopTracksMock).not.toHaveBeenCalled()
    })

    it('returns cached result on second call within TTL', async () => {
        getValidAccessTokenMock.mockResolvedValue('token')
        getUserTopTracksMock.mockResolvedValue([
            { artist: 'Artist C', title: 'Song C' },
        ])

        const first = await getSpotifySeedTracks('user-cache')
        const second = await getSpotifySeedTracks('user-cache')

        expect(first).toEqual(second)
        expect(getValidAccessTokenMock).toHaveBeenCalledTimes(1)
    })

    it('returns empty array when API call throws', async () => {
        getValidAccessTokenMock.mockRejectedValue(new Error('DB error'))

        const tracks = await getSpotifySeedTracks('user-err')

        expect(tracks).toEqual([])
    })

    it('merges top tracks with saved tracks', async () => {
        getValidAccessTokenMock.mockResolvedValue('token')
        getUserTopTracksMock.mockResolvedValue([
            { artist: 'Top Artist', title: 'Top Song' },
        ])
        getUserSavedTracksMock.mockResolvedValue([
            { artist: 'Saved Artist', title: 'Saved Song' },
        ])

        const tracks = await getSpotifySeedTracks('user-merge')

        expect(tracks).toHaveLength(2)
        expect(tracks[0]).toEqual({ artist: 'Top Artist', title: 'Top Song' })
        expect(tracks[1]).toEqual({
            artist: 'Saved Artist',
            title: 'Saved Song',
        })
    })

    it('deduplicates tracks by normalized key', async () => {
        getValidAccessTokenMock.mockResolvedValue('token')
        getUserTopTracksMock.mockResolvedValue([
            { artist: 'Artist X', title: 'Song Y' },
            { artist: 'Artist Z', title: 'Song Z' },
        ])
        getUserSavedTracksMock.mockResolvedValue([
            { artist: 'artist x', title: 'song y' },
        ])

        const tracks = await getSpotifySeedTracks('user-dedup')

        expect(tracks).toHaveLength(2)
        expect(tracks).toEqual([
            { artist: 'Artist X', title: 'Song Y' },
            { artist: 'Artist Z', title: 'Song Z' },
        ])
    })
})

describe('getSpotifySeedSlice', () => {
    beforeEach(async () => {
        jest.clearAllMocks()
        getUserSavedTracksMock.mockResolvedValue([])
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    it('returns slice of tracks from cache', async () => {
        getValidAccessTokenMock.mockResolvedValue('token')
        getUserTopTracksMock.mockResolvedValue([
            { artist: 'A1', title: 'S1' },
            { artist: 'A2', title: 'S2' },
            { artist: 'A3', title: 'S3' },
        ])

        await getSpotifySeedTracks('user-slice')
        const slice = getSpotifySeedSlice('user-slice', 2)

        expect(slice).toEqual([
            { artist: 'A1', title: 'S1' },
            { artist: 'A2', title: 'S2' },
        ])
    })

    it('returns empty array when no cache entry exists', () => {
        const slice = getSpotifySeedSlice('unknown-user', 2)

        expect(slice).toEqual([])
    })

    it('returns at most pool length without wraparound', async () => {
        getValidAccessTokenMock.mockResolvedValue('token')
        getUserTopTracksMock.mockResolvedValue([
            { artist: 'A1', title: 'S1' },
            { artist: 'A2', title: 'S2' },
        ])

        await getSpotifySeedTracks('user-short')
        const slice = getSpotifySeedSlice('user-short', 5)

        expect(slice).toHaveLength(2)
    })
})

describe('getSpotifyCacheOffset', () => {
    beforeEach(async () => {
        jest.clearAllMocks()
        getUserSavedTracksMock.mockResolvedValue([])
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    it('returns initial offset of 0 for new cache entry', async () => {
        getValidAccessTokenMock.mockResolvedValue('token')
        getUserTopTracksMock.mockResolvedValue([
            { artist: 'A1', title: 'S1' },
        ])

        await getSpotifySeedTracks('user-initial')

        expect(getSpotifyCacheOffset('user-initial')).toBe(0)
    })

    it('returns 0 when cache entry does not exist', () => {
        expect(getSpotifyCacheOffset('nonexistent')).toBe(0)
    })

    it('tracks offset progression through advances', async () => {
        getValidAccessTokenMock.mockResolvedValue('token')
        getUserTopTracksMock.mockResolvedValue([
            { artist: 'A1', title: 'S1' },
            { artist: 'A2', title: 'S2' },
            { artist: 'A3', title: 'S3' },
            { artist: 'A4', title: 'S4' },
            { artist: 'A5', title: 'S5' },
            { artist: 'A6', title: 'S6' },
        ])

        await getSpotifySeedTracks('user-track-offset')

        const offsetBefore = getSpotifyCacheOffset('user-track-offset')
        expect(offsetBefore).toBe(0)

        advanceSpotifySeedOffset('user-track-offset')

        const offsetAfter = getSpotifyCacheOffset('user-track-offset')
        expect(offsetAfter).toBe(SPOTIFY_SEED_COUNT)
    })
})

describe('consumeSpotifySeedSlice', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        getUserSavedTracksMock.mockResolvedValue([])
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    it('loads cache, returns slice, and advances offset atomically', async () => {
        getValidAccessTokenMock.mockResolvedValue('token')
        getUserTopTracksMock.mockResolvedValue([
            { artist: 'A1', title: 'S1' },
            { artist: 'A2', title: 'S2' },
            { artist: 'A3', title: 'S3' },
            { artist: 'A4', title: 'S4' },
            { artist: 'A5', title: 'S5' },
        ])

        const slice = await consumeSpotifySeedSlice('user-consume', 3)

        expect(slice).toHaveLength(3)
        expect(slice[0]).toEqual({ artist: 'A1', title: 'S1' })
        expect(getSpotifyCacheOffset('user-consume')).toBe(3)
    })

    it('returns empty array when no cache entry exists', async () => {
        const slice = await consumeSpotifySeedSlice('unknown-user', 3)

        expect(slice).toEqual([])
    })

    it('uses default SPOTIFY_SEED_COUNT when count not specified', async () => {
        getValidAccessTokenMock.mockResolvedValue('token')
        getUserTopTracksMock.mockResolvedValue([
            { artist: 'A1', title: 'S1' },
            { artist: 'A2', title: 'S2' },
            { artist: 'A3', title: 'S3' },
            { artist: 'A4', title: 'S4' },
            { artist: 'A5', title: 'S5' },
        ])

        const slice = await consumeSpotifySeedSlice('user-default')

        expect(slice).toHaveLength(SPOTIFY_SEED_COUNT)
    })

    it('handles concurrent calls with per-user locking', async () => {
        getValidAccessTokenMock.mockResolvedValue('token')
        getUserTopTracksMock.mockResolvedValue([
            { artist: 'A1', title: 'S1' },
            { artist: 'A2', title: 'S2' },
            { artist: 'A3', title: 'S3' },
            { artist: 'A4', title: 'S4' },
            { artist: 'A5', title: 'S5' },
        ])

        const promise1 = consumeSpotifySeedSlice('user-lock-test', 2)
        const promise2 = consumeSpotifySeedSlice('user-lock-test', 2)

        const slice1 = await promise1
        const slice2 = await promise2

        expect(slice1).toHaveLength(2)
        expect(slice2).toHaveLength(2)
        expect(slice1[0]).toEqual({ artist: 'A1', title: 'S1' })
        expect(slice2[0]).toEqual({ artist: 'A3', title: 'S3' })
    })
})
