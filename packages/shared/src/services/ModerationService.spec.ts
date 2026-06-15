import { describe, expect, it, jest, beforeEach } from '@jest/globals'

const mockGetPrismaClient = jest.fn()

// Mock Prisma error class for testing
class MockPrismaError extends Error {
    constructor(
        public message: string,
        public code: string,
    ) {
        super(message)
        Object.setPrototypeOf(this, MockPrismaError.prototype)
    }
}

jest.mock('../utils/database/prismaClient', () => ({
    getPrismaClient: mockGetPrismaClient,
    disconnectPrisma: jest.fn(),
}))

jest.mock('./moderationSettings', () => ({
    getModerationSettings: jest.fn(),
    updateModerationSettings: jest.fn(),
    hasModPermissions: jest.fn(),
    getModerationStats: jest.fn(),
}))

import { ModerationService } from './ModerationService'
import {
    getModerationSettings,
    updateModerationSettings,
    hasModPermissions,
    getModerationStats,
} from './moderationSettings'

describe('ModerationService', () => {
    let service: ModerationService

    beforeEach(() => {
        jest.clearAllMocks()
        service = new ModerationService()
    })

    describe('createCase', () => {
        it('creates a case with caseNumber 1 when no prior cases exist', async () => {
            const newCase = {
                id: 'case-1',
                caseNumber: 1,
                guildId: 'guild-1',
                userId: 'user-1',
                username: 'UserOne',
                moderatorId: 'mod-1',
                moderatorName: 'Moderator',
                type: 'warn',
                reason: 'Spam',
                duration: null,
                expiresAt: null,
                active: true,
                appealed: false,
                appealReason: null,
                appealReviewed: false,
                appealApproved: false,
                channelId: null,
                evidence: [],
                createdAt: new Date(),
                updatedAt: new Date(),
            }

            // @ts-ignore
            mockGetPrismaClient.mockReturnValue({
                $transaction: jest.fn(async (txFn: any) => {
                    return txFn({
                        moderationCase: {
                            // @ts-ignore
                            findFirst: jest.fn().mockResolvedValue(null),
                            // @ts-ignore
                            create: jest.fn().mockResolvedValue(newCase),
                        },
                    })
                }),
            })

            const result = await service.createCase({
                guildId: 'guild-1',
                type: 'warn',
                userId: 'user-1',
                username: 'UserOne',
                moderatorId: 'mod-1',
                moderatorName: 'Moderator',
                reason: 'Spam',
            })

            expect(result.caseNumber).toBe(1)
        })

        it('increments caseNumber from the last case in the guild', async () => {
            const newCase = {
                id: 'case-6',
                caseNumber: 6,
                guildId: 'guild-1',
                userId: 'user-2',
                username: 'UserTwo',
                moderatorId: 'mod-1',
                moderatorName: 'Moderator',
                type: 'ban',
                reason: 'Harassment',
                duration: null,
                expiresAt: null,
                active: true,
                appealed: false,
                appealReason: null,
                appealReviewed: false,
                appealApproved: false,
                channelId: null,
                evidence: [],
                createdAt: new Date(),
                updatedAt: new Date(),
            }

            // @ts-ignore
            mockGetPrismaClient.mockReturnValue({
                $transaction: jest.fn(async (txFn: any) => {
                    return txFn({
                        moderationCase: {
                            // @ts-ignore
                            findFirst: jest.fn().mockResolvedValue({
                                caseNumber: 5,
                            }),
                            // @ts-ignore
                            create: jest.fn().mockResolvedValue(newCase),
                        },
                    })
                }),
            })

            const result = await service.createCase({
                guildId: 'guild-1',
                type: 'ban',
                userId: 'user-2',
                username: 'UserTwo',
                moderatorId: 'mod-1',
                moderatorName: 'Moderator',
                reason: 'Harassment',
            })

            expect(result.caseNumber).toBe(6)
        })

        it('wraps case number generation in a Prisma transaction', async () => {
            const newCase = {
                id: 'case-1',
                caseNumber: 1,
                guildId: 'guild-1',
                userId: 'user-1',
                username: 'User',
                moderatorId: 'mod-1',
                moderatorName: 'Mod',
                type: 'warn',
                reason: null,
                duration: null,
                expiresAt: null,
                active: true,
                appealed: false,
                appealReason: null,
                appealReviewed: false,
                appealApproved: false,
                channelId: null,
                evidence: [],
                createdAt: new Date(),
                updatedAt: new Date(),
            }

            const mockTransaction = jest.fn(async (txFn: any) => {
                return txFn({
                    moderationCase: {
                        // @ts-ignore
                        findFirst: jest.fn().mockResolvedValue(null),
                        // @ts-ignore
                        create: jest.fn().mockResolvedValue(newCase),
                    },
                })
            })

            // @ts-ignore
            mockGetPrismaClient.mockReturnValue({
                $transaction: mockTransaction,
            })

            await service.createCase({
                guildId: 'guild-1',
                type: 'warn',
                userId: 'user-1',
                username: 'User',
                moderatorId: 'mod-1',
                moderatorName: 'Mod',
            })

            expect(mockTransaction).toHaveBeenCalled()
        })

        it('retries on P2002 unique constraint violation and returns the case on success', async () => {
            const newCase = {
                id: 'case-2',
                caseNumber: 2,
                guildId: 'guild-1',
                userId: 'user-1',
                username: 'User',
                moderatorId: 'mod-1',
                moderatorName: 'Mod',
                type: 'warn',
                reason: null,
                duration: null,
                expiresAt: null,
                active: true,
                appealed: false,
                appealReason: null,
                appealReviewed: false,
                appealApproved: false,
                channelId: null,
                evidence: [],
                createdAt: new Date(),
                updatedAt: new Date(),
            }

            let callCount = 0
            const mockTransaction = jest.fn(async (txFn: any) => {
                callCount++
                if (callCount === 1) {
                    // First call: throw P2002
                    const error = new MockPrismaError(
                        'Unique constraint failed on the fields: (`guildId`,`caseNumber`)',
                        'P2002',
                    )
                    throw error
                }
                // Second call: succeed
                return txFn({
                    moderationCase: {
                        // @ts-ignore
                        findFirst: jest.fn().mockResolvedValue({
                            caseNumber: 1,
                        }),
                        // @ts-ignore
                        create: jest.fn().mockResolvedValue(newCase),
                    },
                })
            })

            // @ts-ignore
            mockGetPrismaClient.mockReturnValue({
                $transaction: mockTransaction,
            })

            const result = await service.createCase({
                guildId: 'guild-1',
                type: 'warn',
                userId: 'user-1',
                username: 'User',
                moderatorId: 'mod-1',
                moderatorName: 'Mod',
            })

            expect(result.caseNumber).toBe(2)
            expect(mockTransaction).toHaveBeenCalledTimes(2)
        })

        it('propagates non-P2002 errors immediately without retry', async () => {
            const mockError = new Error('Database connection lost')

            const mockTransaction = jest.fn(async () => {
                throw mockError
            })

            // @ts-ignore
            mockGetPrismaClient.mockReturnValue({
                $transaction: mockTransaction,
            })

            await expect(
                service.createCase({
                    guildId: 'guild-1',
                    type: 'warn',
                    userId: 'user-1',
                    username: 'User',
                    moderatorId: 'mod-1',
                    moderatorName: 'Mod',
                }),
            ).rejects.toThrow('Database connection lost')

            // Should only be called once (no retry on non-P2002 error)
            expect(mockTransaction).toHaveBeenCalledTimes(1)
        })

        it('re-throws P2002 after exhausting max retries', async () => {
            const mockTransaction = jest.fn(async () => {
                const error = new MockPrismaError(
                    'Unique constraint failed on the fields: (`guildId`,`caseNumber`)',
                    'P2002',
                )
                throw error
            })

            // @ts-ignore
            mockGetPrismaClient.mockReturnValue({
                $transaction: mockTransaction,
            })

            await expect(
                service.createCase({
                    guildId: 'guild-1',
                    type: 'warn',
                    userId: 'user-1',
                    username: 'User',
                    moderatorId: 'mod-1',
                    moderatorName: 'Mod',
                }),
            ).rejects.toThrow()

            // Should be called MAX_RETRIES (5) times
            expect(mockTransaction).toHaveBeenCalledTimes(5)
        })
    })

    // #1433: the query + delegation methods below had ZERO test coverage
    // (mutation score 17.76%, 70 no-coverage mutants). These assert the exact
    // prisma query clauses, conditional spreads, and return values, plus that
    // the settings-delegating methods forward to moderationSettings.
    describe('query methods', () => {
        function setupCaseMock() {
            const caseMock = {
                findUnique: jest.fn<(args?: any) => Promise<any>>(),
                findMany: jest.fn<(args?: any) => Promise<any>>(),
                count: jest.fn<(args?: any) => Promise<any>>(),
                updateMany: jest.fn<(args?: any) => Promise<any>>(),
                update: jest.fn<(args?: any) => Promise<any>>(),
            }
            // @ts-ignore — partial Prisma client mock
            mockGetPrismaClient.mockReturnValue({ moderationCase: caseMock })
            return caseMock
        }

        it('getCase queries by the composite guildId_caseNumber key', async () => {
            const m = setupCaseMock()
            m.findUnique.mockResolvedValue(null)

            const result = await service.getCase('guild-1', 7)

            expect(m.findUnique).toHaveBeenCalledWith({
                where: {
                    guildId_caseNumber: { guildId: 'guild-1', caseNumber: 7 },
                },
            })
            expect(result).toBeNull()
        })

        it('getUserCases queries by guild+user ordered by createdAt desc (no active filter by default)', async () => {
            const m = setupCaseMock()
            m.findMany.mockResolvedValue([])

            await service.getUserCases('guild-1', 'user-1')

            expect(m.findMany).toHaveBeenCalledWith({
                where: { guildId: 'guild-1', userId: 'user-1' },
                orderBy: { createdAt: 'desc' },
            })
        })

        it('getUserCases adds active:true when activeOnly is set', async () => {
            const m = setupCaseMock()
            m.findMany.mockResolvedValue([])

            await service.getUserCases('guild-1', 'user-1', true)

            expect(m.findMany).toHaveBeenCalledWith({
                where: { guildId: 'guild-1', userId: 'user-1', active: true },
                orderBy: { createdAt: 'desc' },
            })
        })

        it('getRecentCases applies the limit as take', async () => {
            const m = setupCaseMock()
            m.findMany.mockResolvedValue([])

            await service.getRecentCases('guild-1', 25)

            expect(m.findMany).toHaveBeenCalledWith({
                where: { guildId: 'guild-1' },
                orderBy: { createdAt: 'desc' },
                take: 25,
            })
        })

        it('getCasesSince filters by createdAt gte the given date', async () => {
            const m = setupCaseMock()
            m.findMany.mockResolvedValue([])
            const since = new Date('2026-01-01')

            await service.getCasesSince('guild-1', since)

            expect(m.findMany).toHaveBeenCalledWith({
                where: { guildId: 'guild-1', createdAt: { gte: since } },
                orderBy: { createdAt: 'desc' },
            })
        })

        it('getActiveWarningsCount counts active warn cases and returns the count', async () => {
            const m = setupCaseMock()
            m.count.mockResolvedValue(3)

            const result = await service.getActiveWarningsCount(
                'guild-1',
                'user-1',
            )

            expect(m.count).toHaveBeenCalledWith({
                where: {
                    guildId: 'guild-1',
                    userId: 'user-1',
                    type: 'warn',
                    active: true,
                },
            })
            expect(result).toBe(3)
        })

        it('clearWarnings deactivates active warns and returns the updated count', async () => {
            const m = setupCaseMock()
            m.updateMany.mockResolvedValue({ count: 4 })

            const result = await service.clearWarnings('guild-1', 'user-1')

            expect(m.updateMany).toHaveBeenCalledWith({
                where: {
                    guildId: 'guild-1',
                    userId: 'user-1',
                    type: 'warn',
                    active: true,
                },
                data: { active: false },
            })
            expect(result).toBe(4)
        })

        it('deactivateCase sets active:false by id', async () => {
            const m = setupCaseMock()
            m.update.mockResolvedValue({})

            await service.deactivateCase('case-1')

            expect(m.update).toHaveBeenCalledWith({
                where: { id: 'case-1' },
                data: { active: false },
            })
        })

        it('appealCase records the appeal with reason and timestamp', async () => {
            const m = setupCaseMock()
            m.update.mockResolvedValue({})

            await service.appealCase({
                caseId: 'case-1',
                appealReason: 'mistake',
            })

            expect(m.update).toHaveBeenCalledWith({
                where: { id: 'case-1' },
                data: expect.objectContaining({
                    appealed: true,
                    appealReason: 'mistake',
                    appealedAt: expect.any(Date),
                }),
            })
        })

        it('reviewAppeal deactivates the case when approved', async () => {
            const m = setupCaseMock()
            m.update.mockResolvedValue({})

            await service.reviewAppeal('case-1', true)

            expect(m.update).toHaveBeenCalledWith({
                where: { id: 'case-1' },
                data: {
                    appealReviewed: true,
                    appealApproved: true,
                    active: false,
                },
            })
        })

        it('reviewAppeal leaves the case active when rejected', async () => {
            const m = setupCaseMock()
            m.update.mockResolvedValue({})

            await service.reviewAppeal('case-1', false)

            expect(m.update).toHaveBeenCalledWith({
                where: { id: 'case-1' },
                data: { appealReviewed: true, appealApproved: false },
            })
        })

        it('getExpiredCases finds active cases past their expiry', async () => {
            const m = setupCaseMock()
            m.findMany.mockResolvedValue([])

            await service.getExpiredCases()

            expect(m.findMany).toHaveBeenCalledWith({
                where: { active: true, expiresAt: { lte: expect.any(Date) } },
            })
        })
    })

    describe('settings delegation', () => {
        it('getSettings forwards to getModerationSettings and returns its result', async () => {
            const settings = { guildId: 'guild-1', maxWarnings: 3 }
            // @ts-ignore
            jest.mocked(getModerationSettings).mockResolvedValue(settings)

            const result = await service.getSettings('guild-1')

            expect(getModerationSettings).toHaveBeenCalledWith('guild-1')
            expect(result).toBe(settings)
        })

        it('updateSettings forwards guildId and data to updateModerationSettings', async () => {
            const updated = { guildId: 'guild-1', maxWarnings: 5 }
            // @ts-ignore
            jest.mocked(updateModerationSettings).mockResolvedValue(updated)

            const result = await service.updateSettings('guild-1', {
                maxWarnings: 5,
            })

            expect(updateModerationSettings).toHaveBeenCalledWith('guild-1', {
                maxWarnings: 5,
            })
            expect(result).toBe(updated)
        })

        it('hasModPermissions forwards guild and roles and returns the verdict', async () => {
            jest.mocked(hasModPermissions).mockResolvedValue(true)

            const result = await service.hasModPermissions('guild-1', [
                'role-a',
                'role-b',
            ])

            expect(hasModPermissions).toHaveBeenCalledWith('guild-1', [
                'role-a',
                'role-b',
            ])
            expect(result).toBe(true)
        })

        it('getStats forwards to getModerationStats and returns its result', async () => {
            const stats = { total: 10 }
            // @ts-ignore
            jest.mocked(getModerationStats).mockResolvedValue(stats)

            const result = await service.getStats('guild-1')

            expect(getModerationStats).toHaveBeenCalledWith('guild-1')
            expect(result).toBe(stats)
        })
    })
})
