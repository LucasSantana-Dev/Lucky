import { describe, expect, it, jest, beforeEach } from '@jest/globals'

// Mock functions defined first (before jest.mock calls).
const mockCreate = jest.fn<any>()
const mockFindMany = jest.fn<any>()
const mockFindFirst = jest.fn<any>()
const mockCount = jest.fn<any>()
const mockDeleteMany = jest.fn<any>()
const mockGetPrismaClient = jest.fn<any>()

jest.mock('../utils/database/prismaClient', () => ({
    getPrismaClient: mockGetPrismaClient,
    disconnectPrisma: jest.fn(),
}))

// Now import the module under test.
import {
    TrackHistoryService,
    type TrackHistoryInput,
} from './TrackHistoryService'

const GUILD = 'guild-123'

const sampleInput: TrackHistoryInput = {
    id: 'track-1',
    title: 'Song A',
    author: 'Artist A',
    duration: '3:30',
    url: 'https://youtube.com/watch?v=abc',
    metadata: { isAutoplay: true },
}

/** Builds a Prisma-shaped row for mock returns. */
function row(overrides: Record<string, unknown> = {}) {
    return {
        id: 'row-1',
        trackId: 'track-1',
        title: 'Song A',
        author: 'Artist A',
        duration: '3:30',
        url: 'https://youtube.com/watch?v=abc',
        playedAt: new Date('2026-05-31T12:00:00Z'),
        guildId: GUILD,
        playedBy: null,
        isAutoplay: false,
        ...overrides,
    }
}

describe('TrackHistoryService', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockGetPrismaClient.mockReturnValue({
            trackHistory: {
                create: mockCreate,
                findMany: mockFindMany,
                findFirst: mockFindFirst,
                count: mockCount,
                deleteMany: mockDeleteMany,
            },
        })
    })

    describe('addTrackToHistory', () => {
        it('inserts a row with mapped fields + inferred source and returns true', async () => {
            mockCreate.mockResolvedValue(row())
            mockFindMany.mockResolvedValue([]) // no overflow to trim

            const service = new TrackHistoryService()
            const ok = await service.addTrackToHistory(
                sampleInput,
                GUILD,
                'user-9',
            )

            expect(ok).toBe(true)
            expect(mockCreate).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    guildId: GUILD,
                    trackId: 'track-1',
                    title: 'Song A',
                    author: 'Artist A',
                    url: 'https://youtube.com/watch?v=abc',
                    source: 'youtube',
                    playedBy: 'user-9',
                    isAutoplay: true,
                }),
            })
        })

        it('trims rows beyond maxHistorySize after insert', async () => {
            mockCreate.mockResolvedValue(row())
            mockFindMany.mockResolvedValue([{ id: 'old-1' }, { id: 'old-2' }])

            const service = new TrackHistoryService(7 * 24 * 60 * 60, 2)
            await service.addTrackToHistory(sampleInput, GUILD)

            expect(mockFindMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { guildId: GUILD },
                    skip: 2,
                    orderBy: { playedAt: 'desc' },
                }),
            )
            expect(mockDeleteMany).toHaveBeenCalledWith({
                where: { id: { in: ['old-1', 'old-2'] } },
            })
        })

        it('returns false when the insert fails', async () => {
            mockCreate.mockRejectedValue(new Error('FK violation'))

            const service = new TrackHistoryService()
            const ok = await service.addTrackToHistory(sampleInput, GUILD)

            expect(ok).toBe(false)
        })
    })

    describe('getTrackHistory', () => {
        it('queries newest-first with TTL cutoff + pagination and maps rows', async () => {
            mockFindMany.mockResolvedValue([
                row({ playedAt: new Date('2026-05-31T12:00:00Z') }),
            ])

            const service = new TrackHistoryService()
            const result = await service.getTrackHistory(GUILD, 5, 10)

            expect(mockFindMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: {
                        guildId: GUILD,
                        playedAt: { gte: expect.any(Date) },
                    },
                    orderBy: { playedAt: 'desc' },
                    take: 5,
                    skip: 10,
                }),
            )
            expect(result).toHaveLength(1)
            expect(result[0]).toEqual({
                trackId: 'track-1',
                title: 'Song A',
                author: 'Artist A',
                duration: '3:30',
                url: 'https://youtube.com/watch?v=abc',
                timestamp: new Date('2026-05-31T12:00:00Z').getTime(),
                guildId: GUILD,
                playedBy: undefined,
                isAutoplay: false,
            })
        })

        it('returns an empty array on query error', async () => {
            mockFindMany.mockRejectedValue(new Error('db down'))

            const service = new TrackHistoryService()
            expect(await service.getTrackHistory(GUILD)).toEqual([])
        })
    })

    describe('getLastTrack', () => {
        it('returns the most recent entry or null', async () => {
            mockFindFirst
                .mockResolvedValueOnce(row())
                .mockResolvedValueOnce(null)

            const service = new TrackHistoryService()
            expect(await service.getLastTrack(GUILD)).toMatchObject({
                trackId: 'track-1',
            })
            expect(await service.getLastTrack(GUILD)).toBeNull()
        })
    })

    describe('getTrackHistoryCount', () => {
        it('counts non-expired rows for the guild', async () => {
            mockCount.mockResolvedValue(7)

            const service = new TrackHistoryService()
            expect(await service.getTrackHistoryCount(GUILD)).toBe(7)
            expect(mockCount).toHaveBeenCalledWith({
                where: { guildId: GUILD, playedAt: { gte: expect.any(Date) } },
            })
        })
    })

    describe('clearHistory', () => {
        it('deletes all rows for the guild and returns true', async () => {
            mockDeleteMany.mockResolvedValue({ count: 3 })

            const service = new TrackHistoryService()
            expect(await service.clearHistory(GUILD)).toBe(true)
            expect(mockDeleteMany).toHaveBeenCalledWith({
                where: { guildId: GUILD },
            })
        })
    })

    describe('cleanupOldData', () => {
        it('sweeps rows older than the TTL and returns the deleted count', async () => {
            mockDeleteMany.mockResolvedValue({ count: 12 })

            const service = new TrackHistoryService()
            expect(await service.cleanupOldData()).toBe(12)
            expect(mockDeleteMany).toHaveBeenCalledWith({
                where: { playedAt: { lt: expect.any(Date) } },
            })
        })
    })

    describe('isDuplicateTrack', () => {
        it('detects a recently played url within the window', async () => {
            mockFindMany.mockResolvedValue([
                row({ url: 'https://dup.example/x', playedAt: new Date() }),
            ])

            const service = new TrackHistoryService()
            expect(
                await service.isDuplicateTrack(GUILD, 'https://dup.example/x'),
            ).toBe(true)
        })
    })

    // #1426 widening: these aggregation/analytics methods had ZERO coverage
    // (~144 no-coverage mutants). They aggregate in-memory over getTrackHistory
    // (mock findMany) or query directly, so assert the observable outputs.
    describe('getTopTracks', () => {
        it('counts plays per track and returns them sorted desc, sliced to limit', async () => {
            mockFindMany.mockResolvedValue([
                row({ trackId: 't1', title: 'One' }),
                row({ trackId: 't1', title: 'One' }),
                row({ trackId: 't1', title: 'One' }),
                row({ trackId: 't2', title: 'Two' }),
            ])

            const result = await new TrackHistoryService().getTopTracks(
                GUILD,
                1,
            )

            expect(result).toEqual([{ trackId: 't1', title: 'One', plays: 3 }])
        })

        it('returns [] on query error', async () => {
            mockFindMany.mockRejectedValue(new Error('db down'))
            const result = await new TrackHistoryService().getTopTracks(GUILD)
            expect(result).toEqual([])
        })
    })

    describe('getTopArtists', () => {
        it('counts plays per artist sorted desc', async () => {
            mockFindMany.mockResolvedValue([
                row({ author: 'A' }),
                row({ author: 'A' }),
                row({ author: 'B' }),
            ])

            const result = await new TrackHistoryService().getTopArtists(
                GUILD,
                5,
            )

            expect(result).toEqual([
                { artist: 'A', plays: 2 },
                { artist: 'B', plays: 1 },
            ])
        })
    })

    describe('generateStats', () => {
        it('returns null when there is no history', async () => {
            mockFindMany.mockResolvedValue([])
            const result = await new TrackHistoryService().generateStats(GUILD)
            expect(result).toBeNull()
        })

        it('sums parsed durations and counts (MM:SS parsed, non-MM:SS = 0)', async () => {
            mockFindMany.mockResolvedValue([
                row({ trackId: 't1', author: 'A', duration: '3:30' }), // 210
                row({ trackId: 't2', author: 'B', duration: '1:00' }), // 60
                row({ trackId: 't3', author: 'A', duration: 'LIVE' }), // 0
            ])

            const result = await new TrackHistoryService().generateStats(GUILD)

            expect(result?.totalTracks).toBe(3)
            expect(result?.totalPlayTime).toBe(270)
            expect(result?.topArtists[0]).toEqual({ artist: 'A', plays: 2 })
        })
    })

    describe('cleanupOldData', () => {
        it('deletes rows older than the cutoff and returns the count', async () => {
            mockDeleteMany.mockResolvedValue({ count: 9 })

            const result = await new TrackHistoryService().cleanupOldData()

            expect(result).toBe(9)
            expect(mockDeleteMany).toHaveBeenCalledWith({
                where: { playedAt: { lt: expect.any(Date) } },
            })
        })

        it('returns 0 on error', async () => {
            mockDeleteMany.mockRejectedValue(new Error('db'))
            expect(await new TrackHistoryService().cleanupOldData()).toBe(0)
        })
    })

    describe('clearAllGuildCaches', () => {
        it('deletes all rows for the guild', async () => {
            mockDeleteMany.mockResolvedValue({ count: 3 })

            await new TrackHistoryService().clearAllGuildCaches(GUILD)

            expect(mockDeleteMany).toHaveBeenCalledWith({
                where: { guildId: GUILD },
            })
        })
    })

    describe('getReplayFrequentTracks', () => {
        it('includes only tracks/artists replayed more than twice', async () => {
            mockFindMany.mockResolvedValue([
                { trackId: 't1', author: 'Frequent' },
                { trackId: 't1', author: 'Frequent' },
                { trackId: 't1', author: 'Frequent' },
                { trackId: 't2', author: 'Rare' },
            ])

            const result =
                await new TrackHistoryService().getReplayFrequentTracks(GUILD)

            expect(result.trackIds.has('t1')).toBe(true)
            expect(result.trackIds.has('t2')).toBe(false)
            expect(result.artists.has('frequent')).toBe(true)
            expect(result.artists.has('rare')).toBe(false)
        })

        it('fails open with empty sets on error', async () => {
            mockFindMany.mockRejectedValue(new Error('db'))
            const result =
                await new TrackHistoryService().getReplayFrequentTracks(GUILD)
            expect(result.trackIds.size).toBe(0)
            expect(result.artists.size).toBe(0)
        })
    })

    describe('getAutoplayStats', () => {
        it('computes autoplay totals, percent, and top autoplay artists', async () => {
            mockFindMany.mockResolvedValue([
                row({ isAutoplay: true, author: 'A' }),
                row({ isAutoplay: true, author: 'A' }),
                row({ isAutoplay: false, author: 'B' }),
            ])

            const result = await new TrackHistoryService().getAutoplayStats(
                GUILD,
            )

            expect(result.total).toBe(3)
            expect(result.autoplayCount).toBe(2)
            expect(result.autoplayPercent).toBe(67) // round(2/3*100)
            expect(result.topAutoplayArtists).toEqual([
                { artist: 'a', count: 2 },
            ])
        })

        it('returns zeros on error', async () => {
            mockFindMany.mockRejectedValue(new Error('db'))
            const result = await new TrackHistoryService().getAutoplayStats(
                GUILD,
            )
            expect(result.total).toBe(0)
            expect(result.autoplayPercent).toBe(0)
        })

        it('returns 0 percent for empty history and ignores entries without an author', async () => {
            mockFindMany.mockResolvedValue([])
            const empty = await new TrackHistoryService().getAutoplayStats(
                GUILD,
            )
            expect(empty.autoplayPercent).toBe(0)
            expect(empty.topAutoplayArtists).toEqual([])
        })
    })

    // #1426 widening: call-argument + branch hardening to kill survivors and
    // cover the remaining query-only methods.
    describe('query-arg + branch hardening', () => {
        it('getReplayFrequentTracks queries the right window/shape and excludes count==2', async () => {
            mockFindMany.mockResolvedValue([
                { trackId: 't3', author: 'Thrice' },
                { trackId: 't3', author: 'Thrice' },
                { trackId: 't3', author: 'Thrice' },
                { trackId: 't2', author: 'Twice' },
                { trackId: 't2', author: 'Twice' },
            ])

            const result =
                await new TrackHistoryService().getReplayFrequentTracks(GUILD)

            // count==2 must be EXCLUDED (kills the `> 2` boundary mutant)
            expect(result.trackIds.has('t3')).toBe(true)
            expect(result.trackIds.has('t2')).toBe(false)
            expect(mockFindMany).toHaveBeenCalledWith({
                where: { guildId: GUILD, playedAt: { gte: expect.any(Date) } },
                orderBy: { playedAt: 'desc' },
                take: 10000,
                select: { trackId: true, author: true },
            })
        })

        it('getLastTrack maps the found row and queries by guild + cutoff', async () => {
            mockFindFirst.mockResolvedValue(row({ trackId: 'last-1' }))

            const result = await new TrackHistoryService().getLastTrack(GUILD)

            expect(result?.trackId).toBe('last-1')
            expect(mockFindFirst).toHaveBeenCalledWith({
                where: { guildId: GUILD, playedAt: { gte: expect.any(Date) } },
                orderBy: { playedAt: 'desc' },
            })
        })

        it('getLastTrack returns null when no row and on error', async () => {
            mockFindFirst.mockResolvedValue(null)
            expect(
                await new TrackHistoryService().getLastTrack(GUILD),
            ).toBeNull()
            mockFindFirst.mockRejectedValue(new Error('db'))
            expect(
                await new TrackHistoryService().getLastTrack(GUILD),
            ).toBeNull()
        })

        it('getTrackHistoryCount returns the count by guild + cutoff, 0 on error', async () => {
            mockCount.mockResolvedValue(12)
            const c = await new TrackHistoryService().getTrackHistoryCount(
                GUILD,
            )
            expect(c).toBe(12)
            expect(mockCount).toHaveBeenCalledWith({
                where: { guildId: GUILD, playedAt: { gte: expect.any(Date) } },
            })
            mockCount.mockRejectedValue(new Error('db'))
            expect(
                await new TrackHistoryService().getTrackHistoryCount(GUILD),
            ).toBe(0)
        })

        it('clearHistory deletes by guild and returns true, false on error', async () => {
            mockDeleteMany.mockResolvedValue({ count: 5 })
            expect(await new TrackHistoryService().clearHistory(GUILD)).toBe(
                true,
            )
            expect(mockDeleteMany).toHaveBeenCalledWith({
                where: { guildId: GUILD },
            })
            mockDeleteMany.mockRejectedValue(new Error('db'))
            expect(await new TrackHistoryService().clearHistory(GUILD)).toBe(
                false,
            )
        })

        it('getTrackHistory passes take/skip/order and maps rows', async () => {
            mockFindMany.mockResolvedValue([row({ trackId: 'h1' })])

            const result = await new TrackHistoryService().getTrackHistory(
                GUILD,
                5,
                10,
            )

            expect(result[0].trackId).toBe('h1')
            expect(mockFindMany).toHaveBeenCalledWith({
                where: { guildId: GUILD, playedAt: { gte: expect.any(Date) } },
                orderBy: { playedAt: 'desc' },
                take: 5,
                skip: 10,
            })
        })

        it('getTopArtists returns [] on error', async () => {
            mockFindMany.mockRejectedValue(new Error('db'))
            expect(
                await new TrackHistoryService().getTopArtists(GUILD),
            ).toEqual([])
        })

        it('isDuplicateTrack is false for a non-matching url', async () => {
            mockFindMany.mockResolvedValue([
                row({ url: 'https://other/x', playedAt: new Date() }),
            ])
            expect(
                await new TrackHistoryService().isDuplicateTrack(
                    GUILD,
                    'https://nomatch/y',
                ),
            ).toBe(false)
        })

        it('getTopTracks fetches 100 rows and fully orders three tracks by plays', async () => {
            mockFindMany.mockResolvedValue([
                row({ trackId: 'a', title: 'A' }),
                row({ trackId: 'b', title: 'B' }),
                row({ trackId: 'b', title: 'B' }),
                row({ trackId: 'c', title: 'C' }),
                row({ trackId: 'c', title: 'C' }),
                row({ trackId: 'c', title: 'C' }),
            ])

            const result = await new TrackHistoryService().getTopTracks(GUILD)

            expect(result).toEqual([
                { trackId: 'c', title: 'C', plays: 3 },
                { trackId: 'b', title: 'B', plays: 2 },
                { trackId: 'a', title: 'A', plays: 1 },
            ])
            expect(mockFindMany).toHaveBeenCalledWith(
                expect.objectContaining({ take: 100 }),
            )
        })

        it('getAutoplayStats lowercases authors and returns the top 5 sorted', async () => {
            mockFindMany.mockResolvedValue([
                row({ isAutoplay: true, author: 'Beta' }),
                row({ isAutoplay: true, author: 'Alpha' }),
                row({ isAutoplay: true, author: 'alpha' }),
            ])

            const result = await new TrackHistoryService().getAutoplayStats(
                GUILD,
            )

            expect(result.topAutoplayArtists).toEqual([
                { artist: 'alpha', count: 2 },
                { artist: 'beta', count: 1 },
            ])
        })

        it('getReplayFrequentTracks normalizes artist case/whitespace before counting', async () => {
            mockFindMany.mockResolvedValue([
                { trackId: 'x1', author: 'The Band ' },
                { trackId: 'x2', author: 'the band' },
                { trackId: 'x3', author: 'THE BAND' },
            ])

            const result =
                await new TrackHistoryService().getReplayFrequentTracks(GUILD)

            // three spellings normalize to one artist with count 3 (> 2)
            expect(result.artists.has('the band')).toBe(true)
        })
    })
})
