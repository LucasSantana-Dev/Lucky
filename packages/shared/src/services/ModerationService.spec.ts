import { describe, expect, it, jest, beforeEach } from '@jest/globals'

const mockGetPrismaClient = jest.fn()

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
    })
})
