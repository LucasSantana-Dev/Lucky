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
})
