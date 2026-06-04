import { describe, test, expect, beforeEach, jest } from '@jest/globals'

let mockTx: any = {}

jest.mock('../../utils/database/prismaClient', () => ({
    getPrismaClient: () => ({
        memberXP: {
            upsert: jest.fn<any>(),
            update: jest.fn<any>(),
            findUnique: jest.fn<any>(),
            findMany: jest.fn<any>(),
            count: jest.fn<any>(),
        },
        levelConfig: {
            findUnique: jest.fn<any>(),
            upsert: jest.fn<any>(),
        },
        levelReward: {
            upsert: jest.fn<any>(),
            deleteMany: jest.fn<any>(),
            findMany: jest.fn<any>(),
        },
        $transaction: jest.fn<any>((callback: any) =>
            Promise.resolve().then(() => callback(mockTx)),
        ),
    }),
    disconnectPrisma: jest.fn(),
}))

import { LevelService, xpNeededForLevel } from '../../services/LevelService'

describe('LevelService', () => {
    let service: LevelService

    beforeEach(() => {
        jest.clearAllMocks()
        mockTx = {
            memberXP: {
                upsert: jest.fn<any>(),
                update: jest.fn<any>(),
            },
        }
        service = new LevelService()
    })

    describe('addXP with transaction atomicity', () => {
        test('should wrap read-modify-write in transaction', async () => {
            mockTx.memberXP.upsert.mockResolvedValue({
                id: 'xp1',
                guildId: 'guild1',
                userId: 'user1',
                displayName: 'User1',
                xp: 50,
                level: 0,
                lastXpAt: new Date(),
                createdAt: new Date(),
                updatedAt: new Date(),
            })

            const result = await service.addXP('guild1', 'user1', 50, 'User1')

            expect(result.member.xp).toBe(50)
            expect(result.leveledUp).toBe(false)
            expect(result.newLevel).toBe(0)
            expect(mockTx.memberXP.upsert).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: {
                        guildId_userId: { guildId: 'guild1', userId: 'user1' },
                    },
                    update: expect.objectContaining({
                        xp: { increment: 50 },
                    }),
                }),
            )
        })

        test('should detect level-up and update level in same transaction', async () => {
            const baseLevel = 5
            const xpAtLevel6 = xpNeededForLevel(6)

            mockTx.memberXP.upsert.mockResolvedValue({
                id: 'xp1',
                guildId: 'guild1',
                userId: 'user1',
                displayName: 'User1',
                xp: xpAtLevel6 + 100,
                level: baseLevel,
                lastXpAt: new Date(),
                createdAt: new Date(),
                updatedAt: new Date(),
            })

            mockTx.memberXP.update.mockResolvedValue({
                id: 'xp1',
                guildId: 'guild1',
                userId: 'user1',
                displayName: 'User1',
                xp: xpAtLevel6 + 100,
                level: 6,
                lastXpAt: new Date(),
                createdAt: new Date(),
                updatedAt: new Date(),
            })

            const result = await service.addXP(
                'guild1',
                'user1',
                xpAtLevel6 - baseLevel * baseLevel * 100 + 100,
                'User1',
            )

            expect(result.leveledUp).toBe(true)
            expect(result.newLevel).toBe(6)
            expect(mockTx.memberXP.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: {
                        guildId_userId: { guildId: 'guild1', userId: 'user1' },
                    },
                    data: { level: 6 },
                }),
            )
        })

        test('should handle multiple level-ups in one transaction', async () => {
            const xpLevel3 = xpNeededForLevel(3) + 1

            mockTx.memberXP.upsert.mockResolvedValue({
                id: 'xp1',
                guildId: 'guild1',
                userId: 'user1',
                displayName: 'User1',
                xp: xpLevel3,
                level: 0,
                lastXpAt: new Date(),
                createdAt: new Date(),
                updatedAt: new Date(),
            })

            mockTx.memberXP.update.mockResolvedValue({
                id: 'xp1',
                guildId: 'guild1',
                userId: 'user1',
                displayName: 'User1',
                xp: xpLevel3,
                level: 3,
                lastXpAt: new Date(),
                createdAt: new Date(),
                updatedAt: new Date(),
            })

            const result = await service.addXP(
                'guild1',
                'user1',
                xpLevel3,
                'User1',
            )

            expect(result.leveledUp).toBe(true)
            expect(result.newLevel).toBe(3)
        })

        test('should not update level when no level-up occurs', async () => {
            mockTx.memberXP.upsert.mockResolvedValue({
                id: 'xp1',
                guildId: 'guild1',
                userId: 'user1',
                displayName: 'User1',
                xp: 50,
                level: 0,
                lastXpAt: new Date(),
                createdAt: new Date(),
                updatedAt: new Date(),
            })

            const result = await service.addXP('guild1', 'user1', 50, 'User1')

            expect(result.leveledUp).toBe(false)
            expect(mockTx.memberXP.update).not.toHaveBeenCalled()
        })

        test('should preserve displayName when not provided', async () => {
            mockTx.memberXP.upsert.mockImplementation((opts: any) => {
                expect(opts.update).not.toHaveProperty('displayName')
                return Promise.resolve({
                    id: 'xp1',
                    guildId: 'guild1',
                    userId: 'user1',
                    displayName: 'OldName',
                    xp: 50,
                    level: 0,
                    lastXpAt: new Date(),
                    createdAt: new Date(),
                    updatedAt: new Date(),
                })
            })

            const result = await service.addXP('guild1', 'user1', 50)

            expect(result.member.displayName).toBe('OldName')
        })

        test('should update displayName when provided', async () => {
            mockTx.memberXP.upsert.mockImplementation((opts: any) => {
                expect(opts.update).toHaveProperty('displayName', 'NewName')
                return Promise.resolve({
                    id: 'xp1',
                    guildId: 'guild1',
                    userId: 'user1',
                    displayName: 'NewName',
                    xp: 50,
                    level: 0,
                    lastXpAt: new Date(),
                    createdAt: new Date(),
                    updatedAt: new Date(),
                })
            })

            const result = await service.addXP('guild1', 'user1', 50, 'NewName')

            expect(result.member.displayName).toBe('NewName')
        })

        test('should use XP increment in upsert for concurrent safety', async () => {
            mockTx.memberXP.upsert.mockResolvedValue({
                id: 'xp1',
                guildId: 'guild1',
                userId: 'user1',
                displayName: 'User1',
                xp: 100,
                level: 0,
                lastXpAt: new Date(),
                createdAt: new Date(),
                updatedAt: new Date(),
            })

            await service.addXP('guild1', 'user1', 100, 'User1')

            // Verify that the update uses increment, not direct assignment
            // This prevents lost-update race condition
            const upsertCall = mockTx.memberXP.upsert.mock.calls[0][0]
            expect(upsertCall.update.xp).toEqual({ increment: 100 })
        })
    })
})
