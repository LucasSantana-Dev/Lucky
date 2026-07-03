import { describe, it, expect, jest, beforeEach } from '@jest/globals'
// GiveawayService captures prisma at module load, so the factory must hand
// back the mock at import time (the real prismaClient uses import.meta and
// cannot be compiled by ts-jest).
const mockPrisma = {
    giveaway: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
    },
    giveawayEntry: {
        create: jest.fn(),
        findMany: jest.fn(),
    },
}
jest.mock('../utils/database/prismaClient', () => ({
    getPrismaClient: () => mockPrisma,
}))

import { giveawayService, parseDuration } from './GiveawayService'

describe('parseDuration', () => {
    it('parses minutes correctly', () => {
        expect(parseDuration('10m')).toBe(10 * 60 * 1000)
        expect(parseDuration('1m')).toBe(60 * 1000)
    })

    it('parses hours correctly', () => {
        expect(parseDuration('2h')).toBe(2 * 60 * 60 * 1000)
        expect(parseDuration('1h')).toBe(60 * 60 * 1000)
    })

    it('parses days correctly', () => {
        expect(parseDuration('1d')).toBe(24 * 60 * 60 * 1000)
        expect(parseDuration('7d')).toBe(7 * 24 * 60 * 60 * 1000)
    })

    it('returns null for invalid format', () => {
        expect(parseDuration('invalid')).toBeNull()
        expect(parseDuration('10')).toBeNull()
        expect(parseDuration('m10')).toBeNull()
        expect(parseDuration('')).toBeNull()
    })

    it('handles edge cases', () => {
        expect(parseDuration('0m')).toBe(0)
        expect(parseDuration('100h')).toBe(100 * 60 * 60 * 1000)
    })
})

describe('GiveawayService', () => {
    let prisma: any

    beforeEach(() => {
        jest.clearAllMocks()
        prisma = mockPrisma
    })

    describe('create', () => {
        it('creates a giveaway', async () => {
            const data = {
                guildId: 'guild123',
                channelId: 'channel123',
                prize: 'Test Prize',
                winnersCount: 2,
                endsAt: new Date(),
                createdBy: 'user123',
            }
            prisma.giveaway.create.mockResolvedValue({
                id: 'giveaway123',
                ...data,
                messageId: null,
                endedAt: null,
                winnerIds: [],
                createdAt: new Date(),
            })

            const result = await giveawayService.create(data)
            expect(prisma.giveaway.create).toHaveBeenCalledWith({ data })
            expect(result.id).toBe('giveaway123')
        })
    })

    describe('getActiveByMessageId', () => {
        it('returns a giveaway by message ID if active', async () => {
            const giveaway = {
                id: 'giveaway123',
                messageId: 'msg123',
                endedAt: null,
            }
            prisma.giveaway.findFirst.mockResolvedValue(giveaway)

            const result = await giveawayService.getActiveByMessageId('msg123')
            expect(prisma.giveaway.findFirst).toHaveBeenCalledWith({
                where: { messageId: 'msg123', endedAt: null },
            })
            expect(result).toEqual(giveaway)
        })

        it('returns null for ended giveaway', async () => {
            prisma.giveaway.findFirst.mockResolvedValue(null)

            const result = await giveawayService.getActiveByMessageId('msg123')
            expect(result).toBeNull()
        })
    })

    describe('addEntry', () => {
        it('adds an entry to a giveaway', async () => {
            prisma.giveawayEntry.create.mockResolvedValue({
                id: 'entry123',
                giveawayId: 'giveaway123',
                userId: 'user123',
            })

            await giveawayService.addEntry('giveaway123', 'user123')
            expect(prisma.giveawayEntry.create).toHaveBeenCalledWith({
                data: { giveawayId: 'giveaway123', userId: 'user123' },
            })
        })

        it('ignores duplicate user entries', async () => {
            const duplicateError = new Error('Unique constraint failed')
            ;(duplicateError as any).code = 'P2002'
            prisma.giveawayEntry.create.mockRejectedValue(duplicateError)

            // Should not throw
            await expect(
                giveawayService.addEntry('giveaway123', 'user123'),
            ).resolves.toBeUndefined()
        })
    })

    describe('getEntries', () => {
        it('returns all entries for a giveaway', async () => {
            prisma.giveawayEntry.findMany.mockResolvedValue([
                { userId: 'user1' },
                { userId: 'user2' },
                { userId: 'user3' },
            ])

            const result = await giveawayService.getEntries('giveaway123')
            expect(prisma.giveawayEntry.findMany).toHaveBeenCalledWith({
                where: { giveawayId: 'giveaway123' },
                select: { userId: true },
            })
            expect(result).toEqual(['user1', 'user2', 'user3'])
        })
    })

    describe('endAndDraw', () => {
        it('draws winners from entries', async () => {
            const entries = ['user1', 'user2', 'user3']
            prisma.giveawayEntry.findMany.mockResolvedValue(
                entries.map((userId) => ({ userId })),
            )
            prisma.giveaway.update.mockResolvedValue({})

            const winners = await giveawayService.endAndDraw('giveaway123', 2)
            expect(winners).toHaveLength(2)
            // Draw is random — assert winners are distinct entries, not order.
            expect(new Set(winners).size).toBe(2)
            for (const w of winners) {
                expect(entries).toContain(w)
            }
            // Assert update was called with winners and endedAt
            expect(prisma.giveaway.update).toHaveBeenCalledWith({
                where: { id: 'giveaway123' },
                data: expect.objectContaining({
                    winnerIds: expect.any(Array),
                    endedAt: expect.any(Date),
                }),
            })
        })

        it('returns all entries if fewer than requested winners', async () => {
            const entries = ['user1']
            prisma.giveawayEntry.findMany.mockResolvedValue(
                entries.map((userId) => ({ userId })),
            )
            prisma.giveaway.update.mockResolvedValue({})

            const winners = await giveawayService.endAndDraw('giveaway123', 5)
            expect(winners).toHaveLength(1)
            expect(winners[0]).toBe('user1')
            // Assert update was called
            expect(prisma.giveaway.update).toHaveBeenCalledWith({
                where: { id: 'giveaway123' },
                data: expect.objectContaining({
                    winnerIds: ['user1'],
                    endedAt: expect.any(Date),
                }),
            })
        })

        it('returns empty array for no entries', async () => {
            prisma.giveawayEntry.findMany.mockResolvedValue([])
            prisma.giveaway.update.mockResolvedValue({})

            const winners = await giveawayService.endAndDraw('giveaway123', 2)
            expect(winners).toEqual([])
            // Assert update was called even with no winners
            expect(prisma.giveaway.update).toHaveBeenCalledWith({
                where: { id: 'giveaway123' },
                data: expect.objectContaining({
                    winnerIds: [],
                    endedAt: expect.any(Date),
                }),
            })
        })
    })

    describe('reroll', () => {
        it('redraws winners for an ended giveaway', async () => {
            const giveaway = {
                id: 'giveaway123',
                winnersCount: 2,
                endedAt: new Date(),
            }
            prisma.giveaway.findUnique.mockResolvedValue(giveaway)
            prisma.giveawayEntry.findMany.mockResolvedValue([
                { userId: 'user1' },
                { userId: 'user2' },
                { userId: 'user3' },
            ])
            prisma.giveaway.update.mockResolvedValue({})

            const winners = await giveawayService.reroll('giveaway123')
            expect(winners).toHaveLength(2)
            // Assert that update was called (persistence happened)
            expect(prisma.giveaway.update).toHaveBeenCalled()
        })

        it('returns null for giveaway that has not ended', async () => {
            const giveaway = {
                id: 'giveaway123',
                winnersCount: 2,
                endedAt: null,
            }
            prisma.giveaway.findUnique.mockResolvedValue(giveaway)

            const winners = await giveawayService.reroll('giveaway123')
            expect(winners).toBeNull()
            // Assert update was NOT called (no redraw for active giveaway)
            expect(prisma.giveaway.update).not.toHaveBeenCalled()
        })
    })
})
