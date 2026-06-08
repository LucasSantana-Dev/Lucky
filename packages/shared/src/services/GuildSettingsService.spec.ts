import { describe, expect, it, jest, beforeEach } from '@jest/globals'

const mockFindUnique = jest.fn<any>()
const mockUpsert = jest.fn<any>()
const mockUpdateMany = jest.fn<any>()
const mockGetPrismaClient = jest.fn<any>()

jest.mock('../utils/database/prismaClient', () => ({
    getPrismaClient: mockGetPrismaClient,
    disconnectPrisma: jest.fn(),
}))

jest.mock('./redis', () => ({
    redisClient: {
        get: jest.fn(),
        setex: jest.fn(),
        del: jest.fn(),
    },
}))

import { GuildSettingsService } from './GuildSettingsService'

const GUILD = 'guild-1'

describe('GuildSettingsService — counters (Postgres) + rate limit (in-memory)', () => {
    let service: GuildSettingsService

    beforeEach(() => {
        jest.clearAllMocks()
        mockGetPrismaClient.mockReturnValue({
            guildCounter: {
                findUnique: mockFindUnique,
                upsert: mockUpsert,
                updateMany: mockUpdateMany,
            },
        })
        service = new GuildSettingsService()
    })

    describe('autoplay counter', () => {
        it('maps a row to AutoplayCounter, or null when absent', async () => {
            const lastReset = new Date('2026-05-31T00:00:00Z')
            mockFindUnique
                .mockResolvedValueOnce({
                    autoplayCount: 4,
                    autoplayLastReset: lastReset,
                })
                .mockResolvedValueOnce(null)

            expect(await service.getAutoplayCounter(GUILD)).toEqual({
                guildId: GUILD,
                count: 4,
                lastReset,
            })
            expect(await service.getAutoplayCounter(GUILD)).toBeNull()
        })

        it('increments atomically via upsert and returns the new count', async () => {
            mockUpsert.mockResolvedValue({ autoplayCount: 5 })

            expect(await service.incrementAutoplayCounter(GUILD)).toBe(5)
            expect(mockUpsert).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { guildId: GUILD },
                    create: { guildId: GUILD, autoplayCount: 1 },
                    update: { autoplayCount: { increment: 1 } },
                }),
            )
        })

        it('resets the counter to zero', async () => {
            mockUpsert.mockResolvedValue({ autoplayCount: 0 })
            expect(await service.resetAutoplayCounter(GUILD)).toBe(true)
            expect(mockUpsert).toHaveBeenCalledWith(
                expect.objectContaining({
                    update: expect.objectContaining({ autoplayCount: 0 }),
                }),
            )
        })

        it('returns 0 on increment error', async () => {
            mockUpsert.mockRejectedValueOnce(new Error('db down'))
            expect(await service.incrementAutoplayCounter(GUILD)).toBe(0)
        })

        it('returns false when reset fails with a Prisma error (code + meta)', async () => {
            mockUpsert.mockRejectedValueOnce({
                name: 'PrismaClientKnownRequestError',
                code: 'P2003',
                meta: { field_name: 'guildId' },
                message: 'Invalid invocation',
            })
            expect(await service.resetAutoplayCounter(GUILD)).toBe(false)
        })

        it('returns false when reset fails with a non-Prisma error', async () => {
            mockUpsert.mockRejectedValueOnce(new Error('db down'))
            expect(await service.resetAutoplayCounter(GUILD)).toBe(false)
        })
    })

    describe('repeat counter', () => {
        it('reads the repeat count (0 when no row)', async () => {
            mockFindUnique
                .mockResolvedValueOnce({ repeatCount: 3 })
                .mockResolvedValueOnce(null)
            expect(await service.getRepeatCount(GUILD)).toBe(3)
            expect(await service.getRepeatCount(GUILD)).toBe(0)
        })

        it('increments the repeat count via upsert', async () => {
            mockUpsert.mockResolvedValue({ repeatCount: 2 })
            expect(await service.incrementRepeatCount(GUILD)).toBe(2)
            expect(mockUpsert).toHaveBeenCalledWith(
                expect.objectContaining({
                    update: { repeatCount: { increment: 1 } },
                }),
            )
        })

        it('resets the repeat count to zero', async () => {
            mockUpsert.mockResolvedValue({ repeatCount: 0 })
            expect(await service.resetRepeatCount(GUILD)).toBe(true)
        })
    })

    describe('clearAllAutoplayCounters', () => {
        it('zeroes every guild counter via updateMany', async () => {
            mockUpdateMany.mockResolvedValue({ count: 9 })
            expect(await service.clearAllAutoplayCounters()).toBe(true)
            expect(mockUpdateMany).toHaveBeenCalledWith({
                data: { autoplayCount: 0, autoplayLastReset: expect.any(Date) },
            })
        })

        it('returns false on error', async () => {
            mockUpdateMany.mockRejectedValueOnce(new Error('db down'))
            expect(await service.clearAllAutoplayCounters()).toBe(false)
        })
    })

    describe('rate limiting (in-memory)', () => {
        it('allows the first use then blocks within the cooldown window', async () => {
            expect(await service.isRateLimited(GUILD, 'play', 60)).toBe(false)
            expect(await service.isRateLimited(GUILD, 'play', 60)).toBe(true)
        })

        it('scopes cooldowns per command', async () => {
            await service.isRateLimited(GUILD, 'play', 60)
            expect(await service.isRateLimited(GUILD, 'skip', 60)).toBe(false)
        })

        it('does not touch the database for rate limiting', async () => {
            await service.isRateLimited(GUILD, 'play', 60)
            await service.setRateLimit(GUILD, 'play', 60)
            expect(mockGetPrismaClient).not.toHaveBeenCalled()
        })
    })
})
