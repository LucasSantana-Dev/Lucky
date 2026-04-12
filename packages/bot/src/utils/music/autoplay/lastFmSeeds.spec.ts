import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    jest,
} from '@jest/globals'
import {
    getLastFmSeedTracks,
    getLastFmSeedSlice,
    advanceLastFmSeedOffset,
    getLastFmCacheOffset,
    consumeLastFmSeedSlice,
    consumeBlendedSeedSlice,
    LASTFM_SEED_COUNT,
} from './lastFmSeeds'

const getByDiscordIdMock = jest.fn()
const getTopTracksMock = jest.fn()
const getRecentTracksMock = jest.fn()

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
    getRecentTracks: (...args: unknown[]) => getRecentTracksMock(...args),
}))

describe('getLastFmSeedTracks', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        getRecentTracksMock.mockResolvedValue([])
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
        expect(getTopTracksMock).toHaveBeenCalledWith('user123', '3month', 50)
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

    it('merges recent tracks with top tracks', async () => {
        getByDiscordIdMock.mockResolvedValue({ lastFmUsername: 'user123' })
        getTopTracksMock.mockResolvedValue([
            { artist: 'Top Artist', title: 'Top Song', playCount: 50 },
        ])
        getRecentTracksMock.mockResolvedValue([
            { artist: 'Recent Artist', title: 'Recent Song' },
        ])

        const tracks = await getLastFmSeedTracks('discord-user-merge')

        expect(tracks).toHaveLength(2)
        expect(tracks[0]).toEqual({
            artist: 'Top Artist',
            title: 'Top Song',
        })
        expect(tracks[1]).toEqual({
            artist: 'Recent Artist',
            title: 'Recent Song',
        })
    })

    it('deduplicates tracks by normalized key', async () => {
        getByDiscordIdMock.mockResolvedValue({ lastFmUsername: 'user123' })
        getTopTracksMock.mockResolvedValue([
            { artist: 'Artist A', title: 'Song X', playCount: 10 },
            { artist: 'Artist B', title: 'Song B', playCount: 5 },
        ])
        getRecentTracksMock.mockResolvedValue([
            { artist: 'artist a', title: 'song x' },
        ])

        const tracks = await getLastFmSeedTracks('discord-user-dedup')

        expect(tracks).toHaveLength(2)
        expect(tracks).toEqual([
            { artist: 'Artist A', title: 'Song X' },
            { artist: 'Artist B', title: 'Song B' },
        ])
    })
})

describe('getLastFmSeedSlice', () => {
    beforeEach(async () => {
        jest.clearAllMocks()
        getRecentTracksMock.mockResolvedValue([])
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    it('returns empty array if no cache entry exists', () => {
        const slice = getLastFmSeedSlice('unknown-user', 5)
        expect(slice).toEqual([])
    })

    it('returns slice of cached tracks at current offset', async () => {
        getByDiscordIdMock.mockResolvedValue({ lastFmUsername: 'user123' })
        getTopTracksMock.mockResolvedValue([
            { artist: 'A1', title: 'S1', playCount: 1 },
            { artist: 'A2', title: 'S2', playCount: 2 },
            { artist: 'A3', title: 'S3', playCount: 3 },
            { artist: 'A4', title: 'S4', playCount: 4 },
        ])

        await getLastFmSeedTracks('user-with-cache')

        const slice = getLastFmSeedSlice('user-with-cache', 2)

        expect(slice).toHaveLength(2)
        expect(slice[0]).toEqual({ artist: 'A1', title: 'S1' })
        expect(slice[1]).toEqual({ artist: 'A2', title: 'S2' })
    })

    it('stops at pool length without wraparound within slice', async () => {
        getByDiscordIdMock.mockResolvedValue({ lastFmUsername: 'user123' })
        getTopTracksMock.mockResolvedValue([
            { artist: 'A1', title: 'S1', playCount: 1 },
            { artist: 'A2', title: 'S2', playCount: 2 },
            { artist: 'A3', title: 'S3', playCount: 3 },
            { artist: 'A4', title: 'S4', playCount: 4 },
        ])

        await getLastFmSeedTracks('user-wrap')

        advanceLastFmSeedOffset('user-wrap')

        const slice = getLastFmSeedSlice('user-wrap', 3)

        expect(slice).toHaveLength(3)
        expect(slice[0]).toEqual({ artist: 'A2', title: 'S2' })
        expect(slice[1]).toEqual({ artist: 'A3', title: 'S3' })
        expect(slice[2]).toEqual({ artist: 'A4', title: 'S4' })
    })

    it('returns at most min(count, tracks.length) items without wraparound', async () => {
        getByDiscordIdMock.mockResolvedValue({ lastFmUsername: 'user123' })
        getTopTracksMock.mockResolvedValue([
            { artist: 'A1', title: 'S1', playCount: 1 },
            { artist: 'A2', title: 'S2', playCount: 2 },
        ])

        await getLastFmSeedTracks('user-short')

        const slice = getLastFmSeedSlice('user-short', 5)

        expect(slice).toHaveLength(2)
        expect(slice[0]).toEqual({ artist: 'A1', title: 'S1' })
        expect(slice[1]).toEqual({ artist: 'A2', title: 'S2' })
    })

    it('uses default LASTFM_SEED_COUNT when count not specified', async () => {
        getByDiscordIdMock.mockResolvedValue({ lastFmUsername: 'user123' })
        getTopTracksMock.mockResolvedValue([
            { artist: 'A1', title: 'S1', playCount: 1 },
            { artist: 'A2', title: 'S2', playCount: 2 },
            { artist: 'A3', title: 'S3', playCount: 3 },
            { artist: 'A4', title: 'S4', playCount: 4 },
            { artist: 'A5', title: 'S5', playCount: 5 },
        ])

        await getLastFmSeedTracks('user-default-count')

        const slice = getLastFmSeedSlice('user-default-count')

        expect(slice).toHaveLength(LASTFM_SEED_COUNT)
    })
})

describe('advanceLastFmSeedOffset', () => {
    beforeEach(async () => {
        jest.clearAllMocks()
        getRecentTracksMock.mockResolvedValue([])
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    it('increments offset using modulo wrap-around', async () => {
        getByDiscordIdMock.mockResolvedValue({ lastFmUsername: 'user123' })
        getTopTracksMock.mockResolvedValue([
            { artist: 'A1', title: 'S1', playCount: 1 },
            { artist: 'A2', title: 'S2', playCount: 2 },
            { artist: 'A3', title: 'S3', playCount: 3 },
            { artist: 'A4', title: 'S4', playCount: 4 },
            { artist: 'A5', title: 'S5', playCount: 5 },
            { artist: 'A6', title: 'S6', playCount: 6 },
        ])

        await getLastFmSeedTracks('user-advance')

        expect(getLastFmCacheOffset('user-advance')).toBe(0)

        advanceLastFmSeedOffset('user-advance')

        expect(getLastFmCacheOffset('user-advance')).toBe(LASTFM_SEED_COUNT)
    })

    it('wraps offset around when increment exceeds pool', async () => {
        getByDiscordIdMock.mockResolvedValue({ lastFmUsername: 'user123' })
        getTopTracksMock.mockResolvedValue([
            { artist: 'A1', title: 'S1', playCount: 1 },
            { artist: 'A2', title: 'S2', playCount: 2 },
        ])

        await getLastFmSeedTracks('user-wrap-offset')

        advanceLastFmSeedOffset('user-wrap-offset')

        const offset = getLastFmCacheOffset('user-wrap-offset')

        expect(offset).toBeLessThan(2)
    })

    it('does nothing if no cache entry exists', () => {
        advanceLastFmSeedOffset('unknown-user')

        const offset = getLastFmCacheOffset('unknown-user')

        expect(offset).toBe(0)
    })
})

describe('getLastFmCacheOffset', () => {
    beforeEach(async () => {
        jest.clearAllMocks()
        getRecentTracksMock.mockResolvedValue([])
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    it('returns initial offset of 0 for new cache entry', async () => {
        getByDiscordIdMock.mockResolvedValue({ lastFmUsername: 'user123' })
        getTopTracksMock.mockResolvedValue([
            { artist: 'A1', title: 'S1', playCount: 1 },
        ])

        await getLastFmSeedTracks('user-initial')

        expect(getLastFmCacheOffset('user-initial')).toBe(0)
    })

    it('returns 0 when cache entry does not exist', () => {
        expect(getLastFmCacheOffset('nonexistent')).toBe(0)
    })

    it('tracks offset progression through advances', async () => {
        getByDiscordIdMock.mockResolvedValue({ lastFmUsername: 'user123' })
        getTopTracksMock.mockResolvedValue([
            { artist: 'A1', title: 'S1', playCount: 1 },
            { artist: 'A2', title: 'S2', playCount: 2 },
            { artist: 'A3', title: 'S3', playCount: 3 },
            { artist: 'A4', title: 'S4', playCount: 4 },
            { artist: 'A5', title: 'S5', playCount: 5 },
            { artist: 'A6', title: 'S6', playCount: 6 },
        ])

        await getLastFmSeedTracks('user-track-offset')

        const offsetBefore = getLastFmCacheOffset('user-track-offset')
        expect(offsetBefore).toBe(0)

        advanceLastFmSeedOffset('user-track-offset')

        const offsetAfter = getLastFmCacheOffset('user-track-offset')
        expect(offsetAfter).toBe(LASTFM_SEED_COUNT)
    })
})

describe('consumeLastFmSeedSlice', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        getRecentTracksMock.mockResolvedValue([])
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    it('loads cache, returns slice, and advances offset atomically', async () => {
        getByDiscordIdMock.mockResolvedValue({ lastFmUsername: 'user123' })
        getTopTracksMock.mockResolvedValue([
            { artist: 'A1', title: 'S1', playCount: 1 },
            { artist: 'A2', title: 'S2', playCount: 2 },
            { artist: 'A3', title: 'S3', playCount: 3 },
            { artist: 'A4', title: 'S4', playCount: 4 },
            { artist: 'A5', title: 'S5', playCount: 5 },
        ])

        const slice = await consumeLastFmSeedSlice('user-consume', 3)

        expect(slice).toHaveLength(3)
        expect(slice[0]).toEqual({ artist: 'A1', title: 'S1' })
        expect(slice[1]).toEqual({ artist: 'A2', title: 'S2' })
        expect(slice[2]).toEqual({ artist: 'A3', title: 'S3' })
        expect(getLastFmCacheOffset('user-consume')).toBe(3)
    })

    it('returns empty array when no cache entry exists', async () => {
        const slice = await consumeLastFmSeedSlice('unknown-user', 3)

        expect(slice).toEqual([])
    })

    it('returns at most pool length without wraparound', async () => {
        getByDiscordIdMock.mockResolvedValue({ lastFmUsername: 'user123' })
        getTopTracksMock.mockResolvedValue([
            { artist: 'A1', title: 'S1', playCount: 1 },
            { artist: 'A2', title: 'S2', playCount: 2 },
        ])

        const slice = await consumeLastFmSeedSlice('user-short-consume', 5)

        expect(slice).toHaveLength(2)
        expect(slice[0]).toEqual({ artist: 'A1', title: 'S1' })
        expect(slice[1]).toEqual({ artist: 'A2', title: 'S2' })
    })

    it('handles concurrent calls with per-user locking', async () => {
        getByDiscordIdMock.mockResolvedValue({ lastFmUsername: 'user123' })
        getTopTracksMock.mockResolvedValue([
            { artist: 'A1', title: 'S1', playCount: 1 },
            { artist: 'A2', title: 'S2', playCount: 2 },
            { artist: 'A3', title: 'S3', playCount: 3 },
            { artist: 'A4', title: 'S4', playCount: 4 },
            { artist: 'A5', title: 'S5', playCount: 5 },
        ])

        const promise1 = consumeLastFmSeedSlice('user-lock-test', 2)
        const promise2 = consumeLastFmSeedSlice('user-lock-test', 2)

        const slice1 = await promise1
        const slice2 = await promise2

        expect(slice1).toHaveLength(2)
        expect(slice2).toHaveLength(2)
        expect(slice1[0]).toEqual({ artist: 'A1', title: 'S1' })
        expect(slice2[0]).toEqual({ artist: 'A3', title: 'S3' })
    })

    it('uses default LASTFM_SEED_COUNT when count not specified', async () => {
        getByDiscordIdMock.mockResolvedValue({ lastFmUsername: 'user123' })
        getTopTracksMock.mockResolvedValue([
            { artist: 'A1', title: 'S1', playCount: 1 },
            { artist: 'A2', title: 'S2', playCount: 2 },
            { artist: 'A3', title: 'S3', playCount: 3 },
            { artist: 'A4', title: 'S4', playCount: 4 },
            { artist: 'A5', title: 'S5', playCount: 5 },
        ])

        const slice = await consumeLastFmSeedSlice('user-default-consume')

        expect(slice).toHaveLength(LASTFM_SEED_COUNT)
    })

    it('returns empty array when inner operation throws', async () => {
        getByDiscordIdMock.mockRejectedValue(new Error('DB error'))
        getTopTracksMock.mockRejectedValue(new Error('API error'))

        const slice = await consumeLastFmSeedSlice('user-throw', 3)

        expect(slice).toEqual([])
    })
})

describe('consumeBlendedSeedSlice', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        getRecentTracksMock.mockResolvedValue([])
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    it('returns empty array when userIds is empty', async () => {
        const slice = await consumeBlendedSeedSlice([], 5)

        expect(slice).toEqual([])
    })

    it('interleaves tracks from two users round-robin style', async () => {
        getByDiscordIdMock.mockResolvedValue({ lastFmUsername: 'user123' })
        getTopTracksMock.mockResolvedValue([
            { artist: 'UserA1', title: 'SongA1', playCount: 1 },
            { artist: 'UserA2', title: 'SongA2', playCount: 2 },
            { artist: 'UserA3', title: 'SongA3', playCount: 3 },
            { artist: 'UserA4', title: 'SongA4', playCount: 4 },
        ])

        const slice = await consumeBlendedSeedSlice(
            ['user-alpha', 'user-beta'],
            4,
        )

        expect(slice.length).toBeGreaterThan(0)
        expect(slice[0]).toEqual(expect.objectContaining({
            artist: expect.any(String),
            title: expect.any(String),
        }))
    })

    it('deduplicates identical tracks across users', async () => {
        const sharedTrack = { artist: 'Shared Artist', title: 'Shared Song', playCount: 5 }
        getByDiscordIdMock.mockResolvedValue({ lastFmUsername: 'user123' })
        getTopTracksMock.mockResolvedValue([sharedTrack])

        const slice = await consumeBlendedSeedSlice(
            ['user-x', 'user-y'],
            2,
        )

        expect(slice).toHaveLength(1)
        expect(slice[0]).toEqual({
            artist: 'Shared Artist',
            title: 'Shared Song',
        })
    })

    it('respects count limit', async () => {
        getByDiscordIdMock.mockResolvedValue({ lastFmUsername: 'user123' })
        getTopTracksMock.mockResolvedValue([
            { artist: 'A1', title: 'S1', playCount: 1 },
            { artist: 'A2', title: 'S2', playCount: 2 },
            { artist: 'A3', title: 'S3', playCount: 3 },
        ])

        const slice = await consumeBlendedSeedSlice(
            ['user-p', 'user-q'],
            2,
        )

        expect(slice.length).toBeLessThanOrEqual(2)
    })

    it('falls back to single-user mode when only one user provided', async () => {
        getByDiscordIdMock.mockResolvedValue({ lastFmUsername: 'solo-user' })
        getTopTracksMock.mockResolvedValue([
            { artist: 'Solo1', title: 'Track1', playCount: 1 },
            { artist: 'Solo2', title: 'Track2', playCount: 2 },
        ])

        const slice = await consumeBlendedSeedSlice(['solo-user'], 2)

        expect(slice.length).toBeGreaterThan(0)
        expect(slice[0]).toEqual(expect.objectContaining({
            artist: expect.stringMatching(/^Solo[12]$/),
            title: expect.any(String),
        }))
    })

    it('returns empty array when all users have no Last.fm link', async () => {
        getByDiscordIdMock.mockResolvedValue(null)
        getTopTracksMock.mockResolvedValue([])

        const slice = await consumeBlendedSeedSlice(
            ['no-link-1', 'no-link-2'],
            5,
        )

        expect(slice).toEqual([])
    })
})
