import { describe, expect, it, jest, beforeEach } from '@jest/globals'

const mockFindFirst = jest.fn()
const mockUpdate = jest.fn()
const mockFindMany = jest.fn()
const mockGetPrismaClient = jest.fn()

jest.mock('../utils/database/prismaClient', () => ({
    getPrismaClient: mockGetPrismaClient,
}))

import { GiveawayService } from './GiveawayService'

describe('GiveawayService', () => {
    let service: GiveawayService
    let mockPrisma: any

    beforeEach(() => {
        jest.clearAllMocks()
        mockPrisma = {
            giveaway: {
                findFirst: mockFindFirst,
                findUnique: jest.fn(),
                findMany: mockFindMany,
                update: mockUpdate,
            },
            giveawayEntry: {
                findMany: jest.fn(),
            },
        }
        mockGetPrismaClient.mockReturnValue(mockPrisma)
        service = new GiveawayService()
    })

    describe('endById — guild-scoped', () => {
        it('returns null when giveaway not found for guild', async () => {
            // @ts-ignore
            mockFindFirst.mockResolvedValueOnce(null)

            const result = await service.endById('ga-123', 'guild-1')

            expect(result).toBeNull()
            expect(mockFindFirst).toHaveBeenCalledWith({
                where: { id: 'ga-123', guildId: 'guild-1' },
            })
        })

        it('returns existing record without redraw if already ended', async () => {
            const endedGiveaway = {
                id: 'ga-123',
                guildId: 'guild-1',
                endedAt: new Date('2026-01-02'),
                winnerIds: ['user-1'],
            }
            // @ts-ignore
            mockFindFirst.mockResolvedValueOnce(endedGiveaway)

            const result = await service.endById('ga-123', 'guild-1')

            expect(result).toEqual({
                giveaway: endedGiveaway,
                wasAlreadyEnded: true,
            })
            expect(mockUpdate).not.toHaveBeenCalled()
        })

        it('draws and persists winners if not yet ended', async () => {
            const pendingGiveaway = {
                id: 'ga-123',
                guildId: 'guild-1',
                winnersCount: 2,
                endedAt: null,
                winnerIds: [],
            }
            // @ts-ignore
            mockFindFirst.mockResolvedValueOnce(pendingGiveaway)
            // @ts-ignore
            mockPrisma.giveawayEntry.findMany.mockResolvedValueOnce([
                { userId: 'user-1' },
                { userId: 'user-2' },
                { userId: 'user-3' },
            ])
            // @ts-ignore
            mockUpdate.mockResolvedValueOnce({
                ...pendingGiveaway,
                winnerIds: ['user-2', 'user-1'],
                endedAt: new Date(),
            })

            const result = await service.endById('ga-123', 'guild-1')

            expect(result?.wasAlreadyEnded).toBe(false)
            expect(result?.giveaway.winnerIds).toHaveLength(2)
            expect(result?.giveaway.endedAt).not.toBeNull()
            expect(mockUpdate).toHaveBeenCalled()
        })

        it('prevents cross-guild access (IDOR protection)', async () => {
            // @ts-ignore
            mockFindFirst.mockResolvedValueOnce(null)

            const result = await service.endById('ga-123', 'guild-2')

            expect(result).toBeNull()
            expect(mockFindFirst).toHaveBeenCalledWith({
                where: { id: 'ga-123', guildId: 'guild-2' },
            })
        })
    })

    describe('reroll — guild-scoped', () => {
        it('returns null if not found for guild', async () => {
            // @ts-ignore jest.fn type inference
            // @ts-ignore
            mockFindFirst.mockResolvedValueOnce(null)

            const result = await service.reroll('ga-123', 'guild-1')

            expect(result).toBeNull()
        })

        it('returns null if not ended', async () => {
            // @ts-ignore
            mockFindFirst.mockResolvedValueOnce({
                id: 'ga-123',
                endedAt: null,
            })

            const result = await service.reroll('ga-123', 'guild-1')

            expect(result).toBeNull()
        })

        it('redraws winners without updating endedAt', async () => {
            const originalEndedAt = new Date('2026-01-02')
            const endedGiveaway = {
                id: 'ga-123',
                guildId: 'guild-1',
                winnersCount: 1,
                endedAt: originalEndedAt,
                winnerIds: ['user-old'],
            }

            // @ts-ignore
            mockFindFirst.mockResolvedValueOnce(endedGiveaway)
            // @ts-ignore
            mockPrisma.giveaway.findUnique.mockResolvedValueOnce(endedGiveaway)
            // @ts-ignore
            mockPrisma.giveawayEntry.findMany.mockResolvedValueOnce([
                { userId: 'user-1' },
                { userId: 'user-2' },
            ])
            // @ts-ignore
            mockUpdate.mockResolvedValueOnce({
                ...endedGiveaway,
                winnerIds: ['user-1'],
            })

            const result = await service.reroll('ga-123', 'guild-1')

            expect(result).toHaveLength(1)
            const updateCall = mockUpdate.mock.calls[0]?.[0]
            // Should NOT have endedAt in data
            // @ts-ignore
            expect(updateCall?.data?.endedAt).toBeUndefined()
        })

        it('prevents cross-guild reroll (IDOR protection)', async () => {
            // @ts-ignore
            mockFindFirst.mockResolvedValueOnce(null)

            const result = await service.reroll('ga-123', 'guild-2')

            expect(result).toBeNull()
        })
    })

    describe('endAndDraw', () => {
        it('draws winners and sets endedAt', async () => {
            // @ts-ignore
            mockPrisma.giveawayEntry.findMany.mockResolvedValueOnce([
                { userId: 'user-1' },
                { userId: 'user-2' },
                { userId: 'user-3' },
            ])

            // @ts-ignore
            mockUpdate.mockResolvedValueOnce({
                id: 'ga-123',
                winnerIds: ['user-1', 'user-2'],
                endedAt: new Date(),
            })

            const result = await service.endAndDraw('ga-123', 2)

            expect(result).toHaveLength(2)
            expect(mockUpdate).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: 'ga-123' },
                }),
            )
        })

        it('handles empty entries', async () => {
            // @ts-ignore
            mockPrisma.giveawayEntry.findMany.mockResolvedValueOnce([])

            // @ts-ignore
            mockUpdate.mockResolvedValueOnce({
                id: 'ga-123',
                winnerIds: [],
                endedAt: new Date(),
            })

            const result = await service.endAndDraw('ga-123', 3)

            expect(result).toEqual([])
        })
    })

    describe('getEndedDue', () => {
        it('returns due giveaways', async () => {
            const duGiveaways = [
                { id: 'ga-1', endsAt: new Date('2026-01-01'), endedAt: null },
                { id: 'ga-2', endsAt: new Date('2026-01-02'), endedAt: null },
            ]
            // @ts-ignore
            mockFindMany.mockResolvedValueOnce(duGiveaways)

            const result = await service.getEndedDue()

            expect(result).toEqual(duGiveaways)
            expect(mockFindMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: {
                        endsAt: expect.any(Object),
                        endedAt: null,
                    },
                }),
            )
        })
    })
})
