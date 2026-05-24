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
    isLovedSeed,
    LASTFM_SEED_COUNT,
} from './lastFmSeeds'

const getByDiscordIdMock = jest.fn()
const getTopTracksMock = jest.fn()
const getRecentTracksMock = jest.fn()
const getLovedTracksMock = jest.fn()

jest.mock('@lucky/shared/services', () => ({
    lastFmLinkService: {
        getByDiscordId: (...args: unknown[]) => getByDiscordIdMock(...args),
    },
}))

jest.mock('@lucky/shared/utils', () => ({
    debugLog: jest.fn(),
    errorLog: jest.fn(),
}))

jest.mock('../../../lastfm/lastFmApi', () => ({
    getTopTracks: (...args: unknown[]) => getTopTracksMock(...args),
    getRecentTracks: (...args: unknown[]) => getRecentTracksMock(...args),
    getLovedTracks: (...args: unknown[]) => getLovedTracksMock(...args),
}))

describe('getLastFmSeedTracks', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        getLovedTracksMock.mockResolvedValue([])
        getRecentTracksMock.mockResolvedValue([])
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    it.each([
        { name: 'no Last.fm link (null)', link: null },
        { name: 'no lastFmUsername', link: { lastFmUsername: null } },
        { name: 'API throws', link: { lastFmUsername: 'user' }, error: true },
    ])(
        'returns empty array when user $name',
        async ({ link, error }) => {
            getByDiscordIdMock.mockResolvedValue(link)
            if (error) {
                getTopTracksMock.mockRejectedValue(new Error('API error'))
            }

            const tracks = await getLastFmSeedTracks('user-test')

            expect(tracks).toEqual([])
        },
    )

    it('returns tracks with API call and caching', async () => {
        getByDiscordIdMock.mockResolvedValue({ lastFmUsername: 'user123' })
        getTopTracksMock.mockResolvedValue([
            { artist: 'Artist A', title: 'Song A', playCount: 10 },
            { artist: 'Artist B', title: 'Song B', playCount: 5 },
        ])

        const first = await getLastFmSeedTracks('discord-user-1')
        const second = await getLastFmSeedTracks('discord-user-1')

        expect(first).toEqual([
            { artist: 'Artist A', title: 'Song A' },
            { artist: 'Artist B', title: 'Song B' },
        ])
        expect(first).toEqual(second)
        expect(getTopTracksMock).toHaveBeenCalledWith('user123', '3month', 50)
        expect(getTopTracksMock).toHaveBeenCalledTimes(1)
    })

    it('merges, deduplicates, and filters tracks from all sources', async () => {
        getByDiscordIdMock.mockResolvedValue({ lastFmUsername: 'user123' })
        getTopTracksMock.mockResolvedValue([
            { artist: 'Artist A', title: 'Song X', playCount: 10 },
            { artist: 'Artist B', title: 'Song B', playCount: 5 },
            { artist: 'Artist A', title: 'Good Song', playCount: 3 },
        ])
        getRecentTracksMock.mockResolvedValue([
            { artist: 'artist a', title: 'song x' },
            { artist: undefined as unknown as string, title: 'No Artist' },
            { artist: 'Artist B', title: undefined as unknown as string },
            { artist: 'Recent Artist', title: 'Recent Song' },
        ])

        const tracks = await getLastFmSeedTracks('discord-user-all')

        expect(tracks.every((t) => t.artist && t.title)).toBe(true)
        expect(tracks).toHaveLength(4)
        expect(tracks[0]).toEqual({ artist: 'Artist A', title: 'Song X' })
        expect(tracks[1]).toEqual({ artist: 'Artist B', title: 'Song B' })
        expect(tracks[2]).toEqual({ artist: 'Artist A', title: 'Good Song' })
        expect(tracks[3]).toEqual({ artist: 'Recent Artist', title: 'Recent Song' })
    })
})

describe('getLastFmSeedSlice', () => {
    beforeEach(async () => {
        jest.clearAllMocks()
        getLovedTracksMock.mockResolvedValue([])
        getRecentTracksMock.mockResolvedValue([])
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    it('returns empty array if no cache entry exists', () => {
        const slice = getLastFmSeedSlice('unknown-user', 5)
        expect(slice).toEqual([])
    })

    it.each([
        { poolSize: 4, requestCount: 2, advanceFirst: false, expectedLength: 2 },
        { poolSize: 20, requestCount: 8, advanceFirst: true, expectedLength: 5 },
        { poolSize: 2, requestCount: 5, advanceFirst: false, expectedLength: 2 },
    ])(
        'returns slices at correct offset (pool=$poolSize)',
        async ({ poolSize, requestCount, advanceFirst, expectedLength }) => {
            getByDiscordIdMock.mockResolvedValue({ lastFmUsername: 'user123' })
            getTopTracksMock.mockResolvedValue(
                Array.from({ length: poolSize }, (_, i) => ({
                    artist: `A${i + 1}`,
                    title: `S${i + 1}`,
                    playCount: i + 1,
                })),
            )

            const userId = `user-slice-${poolSize}`
            await getLastFmSeedTracks(userId)

            if (advanceFirst) {
                advanceLastFmSeedOffset(userId)
            }

            const slice = getLastFmSeedSlice(userId, requestCount)

            expect(slice).toHaveLength(expectedLength)
            expect(slice[0]).toEqual({ artist: expect.stringMatching(/^A\d+$/), title: expect.stringMatching(/^S\d+$/) })
        },
    )

    it('uses default LASTFM_SEED_COUNT when count not specified', async () => {
        getByDiscordIdMock.mockResolvedValue({ lastFmUsername: 'user123' })
        getTopTracksMock.mockResolvedValue(
            Array.from({ length: 20 }, (_, i) => ({
                artist: `A${i + 1}`,
                title: `S${i + 1}`,
                playCount: i + 1,
            })),
        )

        await getLastFmSeedTracks('user-default-count')

        const slice = getLastFmSeedSlice('user-default-count')

        expect(slice).toHaveLength(LASTFM_SEED_COUNT)
    })
})

describe('advanceLastFmSeedOffset / getLastFmCacheOffset', () => {
    beforeEach(async () => {
        jest.clearAllMocks()
        getLovedTracksMock.mockResolvedValue([])
        getRecentTracksMock.mockResolvedValue([])
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    it('returns 0 for new or nonexistent cache entries', async () => {
        getByDiscordIdMock.mockResolvedValue({ lastFmUsername: 'user123' })
        getTopTracksMock.mockResolvedValue([
            { artist: 'A1', title: 'S1', playCount: 1 },
        ])

        await getLastFmSeedTracks('user-initial')
        expect(getLastFmCacheOffset('user-initial')).toBe(0)
        expect(getLastFmCacheOffset('nonexistent')).toBe(0)
    })

    it.each([
        { poolSize: 20, shouldWrap: false },
        { poolSize: 2, shouldWrap: true },
    ])(
        'advances offset with modulo wrap (pool=$poolSize)',
        async ({ poolSize, shouldWrap }) => {
            getByDiscordIdMock.mockResolvedValue({ lastFmUsername: 'user123' })
            getTopTracksMock.mockResolvedValue(
                Array.from({ length: poolSize }, (_, i) => ({
                    artist: `A${i + 1}`,
                    title: `S${i + 1}`,
                    playCount: i + 1,
                })),
            )

            const userId = `user-offset-${poolSize}`
            await getLastFmSeedTracks(userId)

            expect(getLastFmCacheOffset(userId)).toBe(0)
            advanceLastFmSeedOffset(userId)

            if (shouldWrap) {
                expect(getLastFmCacheOffset(userId)).toBeLessThan(poolSize)
            } else {
                expect(getLastFmCacheOffset(userId)).toBe(LASTFM_SEED_COUNT)
            }
        },
    )

    it('does nothing when advancing nonexistent cache entry', () => {
        advanceLastFmSeedOffset('unknown-user')
        expect(getLastFmCacheOffset('unknown-user')).toBe(0)
    })
})

describe('consumeLastFmSeedSlice', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        getLovedTracksMock.mockResolvedValue([])
        getRecentTracksMock.mockResolvedValue([])
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    it.each([
        { poolSize: 5, requestCount: 3, expectedFirstOffset: 3 },
        { poolSize: 2, requestCount: 5, expectedFirstOffset: undefined },
        { poolSize: 20, requestCount: undefined, expectedFirstOffset: undefined },
    ])(
        'loads, slices, advances atomically (pool=$poolSize)',
        async ({ poolSize, requestCount, expectedFirstOffset }) => {
            getByDiscordIdMock.mockResolvedValue({ lastFmUsername: 'user123' })
            getTopTracksMock.mockResolvedValue(
                Array.from({ length: poolSize }, (_, i) => ({
                    artist: `A${i + 1}`,
                    title: `S${i + 1}`,
                    playCount: i + 1,
                })),
            )

            const userId = `user-consume-${poolSize}`
            const slice = await consumeLastFmSeedSlice(userId, requestCount)

            expect(slice[0]).toEqual({ artist: 'A1', title: 'S1' })
            if (requestCount || poolSize === 20) {
                const expected = requestCount ?? LASTFM_SEED_COUNT
                expect(slice).toHaveLength(Math.min(expected, poolSize))
            }
        },
    )

    it('returns empty array when no cache or on error', async () => {
        const unknownSlice = await consumeLastFmSeedSlice('unknown-user', 3)
        expect(unknownSlice).toEqual([])

        getByDiscordIdMock.mockRejectedValue(new Error('DB error'))
        const errorSlice = await consumeLastFmSeedSlice('user-throw', 3)
        expect(errorSlice).toEqual([])
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
})

describe('consumeBlendedSeedSlice', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        getLovedTracksMock.mockResolvedValue([])
        getRecentTracksMock.mockResolvedValue([])
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    it('returns empty array when userIds is empty or all have no link', async () => {
        const emptySlice = await consumeBlendedSeedSlice([], 5)
        expect(emptySlice).toEqual([])

        getByDiscordIdMock.mockResolvedValue(null)
        getTopTracksMock.mockResolvedValue([])
        const noLinkSlice = await consumeBlendedSeedSlice(['no-link-1', 'no-link-2'], 5)
        expect(noLinkSlice).toEqual([])
    })

    it('interleaves, deduplicates, and respects count limit', async () => {
        getByDiscordIdMock.mockResolvedValue({ lastFmUsername: 'user123' })
        getTopTracksMock.mockResolvedValue([
            { artist: 'A1', title: 'S1', playCount: 1 },
            { artist: 'A2', title: 'S2', playCount: 2 },
            { artist: 'A3', title: 'S3', playCount: 3 },
        ])

        const slice = await consumeBlendedSeedSlice(['user-p', 'user-q'], 2)

        expect(slice.length).toBeLessThanOrEqual(2)
        expect(slice[0]).toEqual(
            expect.objectContaining({
                artist: expect.any(String),
                title: expect.any(String),
            }),
        )
    })

    it('allocates weighted slices proportionally', async () => {
        getByDiscordIdMock.mockImplementation((userId) =>
            Promise.resolve({
                lastFmUsername: `user-${userId}`,
            }),
        )
        getTopTracksMock.mockImplementation((username) => {
            if (username === 'user-user-1')
                return Promise.resolve([
                    { artist: 'User1Artist', title: 'Track1', playCount: 1 },
                    { artist: 'User1Artist', title: 'Track2', playCount: 1 },
                    { artist: 'User1Artist', title: 'Track3', playCount: 1 },
                    { artist: 'User1Artist', title: 'Track4', playCount: 1 },
                ])
            if (username === 'user-user-2')
                return Promise.resolve([
                    { artist: 'User2Artist', title: 'TrackA', playCount: 1 },
                    { artist: 'User2Artist', title: 'TrackB', playCount: 1 },
                ])
            return Promise.resolve([])
        })

        const weights = new Map<string, number>([
            ['user-1', 2],
            ['user-2', 1],
        ])
        const slice = await consumeBlendedSeedSlice(['user-1', 'user-2'], 3, weights)

        expect(slice.length).toBeLessThanOrEqual(3)
        const user1Tracks = slice.filter((t) => t.artist.includes('User1'))
        const user2Tracks = slice.filter((t) => t.artist.includes('User2'))
        expect(user1Tracks.length).toBeGreaterThanOrEqual(user2Tracks.length)
    })
})

describe('isLovedSeed', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        getLovedTracksMock.mockResolvedValue([])
        getRecentTracksMock.mockResolvedValue([])
    })

    it.each([
        {
            name: 'unknown user',
            artist: 'Artist',
            title: 'Title',
            setupFn: undefined,
            expected: false,
        },
        {
            name: 'loved track found',
            artist: 'Loved Artist',
            title: 'Loved Song',
            setupFn: async () => {
                getByDiscordIdMock.mockResolvedValue({ lastFmUsername: 'user123' })
                getTopTracksMock.mockResolvedValue([])
                getLovedTracksMock.mockResolvedValue([
                    { artist: 'Loved Artist', title: 'Loved Song' },
                ])
                await getLastFmSeedTracks('loved-user')
            },
            expected: true,
        },
        {
            name: 'unloved track',
            artist: 'Other Artist',
            title: 'Other Song',
            setupFn: async () => {
                getByDiscordIdMock.mockResolvedValue({ lastFmUsername: 'user123' })
                getTopTracksMock.mockResolvedValue([])
                getLovedTracksMock.mockResolvedValue([
                    { artist: 'Loved Artist', title: 'Loved Song' },
                ])
                await getLastFmSeedTracks('loved-user-2')
            },
            expected: false,
        },
    ])('$name: returns $expected', async ({ artist, title, setupFn, expected }) => {
        if (setupFn) {
            await setupFn()
        }

        const result = isLovedSeed(setupFn ? 'loved-user' : 'unknown-user', artist, title)

        expect(result).toBe(expected)
    })
})
