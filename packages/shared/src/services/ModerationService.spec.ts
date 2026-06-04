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

import { ModerationService } from './ModerationService'

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
})
