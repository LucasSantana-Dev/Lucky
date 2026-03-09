import { describe, test, expect, beforeEach, jest } from '@jest/globals'

const mockPrisma: any = {
    moderationCase: {
        create: jest.fn<any>(),
        findFirst: jest.fn<any>(),
        findUnique: jest.fn<any>(),
        findMany: jest.fn<any>(),
        count: jest.fn<any>(),
        update: jest.fn<any>(),
        updateMany: jest.fn<any>(),
    },
}

const mockModerationSettings = {
    getModerationSettings: jest.fn<any>(),
    updateModerationSettings: jest.fn<any>(),
    hasModPermissions: jest.fn<any>(),
    getModerationStats: jest.fn<any>(),
}

jest.mock('@lucky/shared/utils/database/prismaClient', () => ({
    getPrismaClient: () => mockPrisma,
}))

jest.mock(
    '@lucky/shared/services/moderationSettings',
    () => mockModerationSettings,
)

import { ModerationService } from '@lucky/shared/services/ModerationService'

describe('ModerationService', () => {
    let service: InstanceType<typeof ModerationService>

    const GUILD_A = '111111111111111111'
    const GUILD_B = '222222222222222222'
    const USER_A = '333333333333333333'
    const USER_B = '444444444444444444'
    const MOD_A = '555555555555555555'

    beforeEach(() => {
        jest.clearAllMocks()
        service = new ModerationService()
    })

    describe('createCase', () => {
        test('should create a case with correct case number when no prior cases exist', async () => {
            mockPrisma.moderationCase.findFirst.mockResolvedValue(null)
            mockPrisma.moderationCase.create.mockResolvedValue({
                id: 'case-1',
                caseNumber: 1,
                guildId: GUILD_A,
                type: 'warn',
                userId: USER_A,
                username: 'testuser',
                moderatorId: MOD_A,
                moderatorName: 'moduser',
                reason: 'test reason',
                active: true,
            })

            const result = await service.createCase({
                guildId: GUILD_A,
                type: 'warn',
                userId: USER_A,
                username: 'testuser',
                moderatorId: MOD_A,
                moderatorName: 'moduser',
                reason: 'test reason',
            })

            expect(result.caseNumber).toBe(1)
            expect(result.guildId).toBe(GUILD_A)
            expect(mockPrisma.moderationCase.findFirst).toHaveBeenCalledWith({
                where: { guildId: GUILD_A },
                orderBy: { caseNumber: 'desc' },
            })
        })

        test('should increment case number from last case', async () => {
            mockPrisma.moderationCase.findFirst.mockResolvedValue({
                caseNumber: 5,
            })
            mockPrisma.moderationCase.create.mockResolvedValue({
                id: 'case-6',
                caseNumber: 6,
                guildId: GUILD_A,
                type: 'ban',
                userId: USER_A,
            })

            await service.createCase({
                guildId: GUILD_A,
                type: 'ban',
                userId: USER_A,
                username: 'testuser',
                moderatorId: MOD_A,
                moderatorName: 'moduser',
            })

            expect(mockPrisma.moderationCase.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({ caseNumber: 6 }),
                }),
            )
        })

        test('should calculate expiresAt for timed punishments', async () => {
            mockPrisma.moderationCase.findFirst.mockResolvedValue(null)
            mockPrisma.moderationCase.create.mockImplementation(
                (args: { data: Record<string, unknown> }) =>
                    Promise.resolve(args.data),
            )

            const result = await service.createCase({
                guildId: GUILD_A,
                type: 'mute',
                userId: USER_A,
                username: 'testuser',
                moderatorId: MOD_A,
                moderatorName: 'moduser',
                duration: 3600,
            })

            expect(result.expiresAt).toBeInstanceOf(Date)
            expect(result.duration).toBe(3600)
        })

        test('should set expiresAt to null when no duration', async () => {
            mockPrisma.moderationCase.findFirst.mockResolvedValue(null)
            mockPrisma.moderationCase.create.mockImplementation(
                (args: { data: Record<string, unknown> }) =>
                    Promise.resolve(args.data),
            )

            const result = await service.createCase({
                guildId: GUILD_A,
                type: 'warn',
                userId: USER_A,
                username: 'testuser',
                moderatorId: MOD_A,
                moderatorName: 'moduser',
            })

            expect(result.expiresAt).toBeNull()
        })

        test('should support multi-server isolation (different guilds get independent case numbers)', async () => {
            mockPrisma.moderationCase.findFirst
                .mockResolvedValueOnce({ caseNumber: 10 })
                .mockResolvedValueOnce({ caseNumber: 3 })

            mockPrisma.moderationCase.create.mockImplementation(
                (args: { data: Record<string, unknown> }) =>
                    Promise.resolve(args.data),
            )

            const caseA = await service.createCase({
                guildId: GUILD_A,
                type: 'warn',
                userId: USER_A,
                username: 'testuser',
                moderatorId: MOD_A,
                moderatorName: 'moduser',
            })

            const caseB = await service.createCase({
                guildId: GUILD_B,
                type: 'warn',
                userId: USER_A,
                username: 'testuser',
                moderatorId: MOD_A,
                moderatorName: 'moduser',
            })

            expect(caseA.caseNumber).toBe(11)
            expect(caseB.caseNumber).toBe(4)
            expect(caseA.guildId).toBe(GUILD_A)
            expect(caseB.guildId).toBe(GUILD_B)
        })

        test('should store optional fields (channelId, evidence)', async () => {
            mockPrisma.moderationCase.findFirst.mockResolvedValue(null)
            mockPrisma.moderationCase.create.mockImplementation(
                (args: { data: Record<string, unknown> }) =>
                    Promise.resolve(args.data),
            )

            const result = await service.createCase({
                guildId: GUILD_A,
                type: 'ban',
                userId: USER_A,
                username: 'testuser',
                moderatorId: MOD_A,
                moderatorName: 'moduser',
                reason: 'spam',
                channelId: 'channel-123',
                evidence: ['screenshot1.png', 'screenshot2.png'],
            })

            expect(result.reason).toEqual('spam')
            expect(result.channelId).toEqual('channel-123')
            expect(result.evidence).toEqual([
                'screenshot1.png',
                'screenshot2.png',
            ])
        })
    })

    describe('getCase', () => {
        test('should return case by guild and case number', async () => {
            const mockCase = {
                id: 'case-1',
                guildId: GUILD_A,
                caseNumber: 1,
                type: 'warn',
            }
            mockPrisma.moderationCase.findUnique.mockResolvedValue(mockCase)

            const result = await service.getCase(GUILD_A, 1)

            expect(result).toEqual(mockCase)
            expect(mockPrisma.moderationCase.findUnique).toHaveBeenCalledWith({
                where: {
                    guildId_caseNumber: { guildId: GUILD_A, caseNumber: 1 },
                },
            })
        })

        test('should return null for non-existent case', async () => {
            mockPrisma.moderationCase.findUnique.mockResolvedValue(null)

            const result = await service.getCase(GUILD_A, 999)

            expect(result).toBeNull()
        })
    })

    describe('getUserCases', () => {
        test('should return all cases for a user in a guild', async () => {
            const cases = [
                { id: 'c1', type: 'warn', userId: USER_A, guildId: GUILD_A },
                { id: 'c2', type: 'mute', userId: USER_A, guildId: GUILD_A },
            ]
            mockPrisma.moderationCase.findMany.mockResolvedValue(cases)

            const result = await service.getUserCases(GUILD_A, USER_A)

            expect(result).toHaveLength(2)
            expect(mockPrisma.moderationCase.findMany).toHaveBeenCalledWith({
                where: { guildId: GUILD_A, userId: USER_A },
                orderBy: { createdAt: 'desc' },
            })
        })

        test('should filter active only when requested', async () => {
            mockPrisma.moderationCase.findMany.mockResolvedValue([])

            await service.getUserCases(GUILD_A, USER_A, true)

            expect(mockPrisma.moderationCase.findMany).toHaveBeenCalledWith({
                where: { guildId: GUILD_A, userId: USER_A, active: true },
                orderBy: { createdAt: 'desc' },
            })
        })

        test('should isolate cases per guild (multi-server)', async () => {
            mockPrisma.moderationCase.findMany.mockResolvedValue([])

            await service.getUserCases(GUILD_A, USER_A)
            await service.getUserCases(GUILD_B, USER_A)

            const calls = mockPrisma.moderationCase.findMany.mock.calls
            expect(calls[0][0].where.guildId).toBe(GUILD_A)
            expect(calls[1][0].where.guildId).toBe(GUILD_B)
        })
    })

    describe('getRecentCases', () => {
        test('should return recent cases with default limit', async () => {
            mockPrisma.moderationCase.findMany.mockResolvedValue([])

            await service.getRecentCases(GUILD_A)

            expect(mockPrisma.moderationCase.findMany).toHaveBeenCalledWith({
                where: { guildId: GUILD_A },
                orderBy: { createdAt: 'desc' },
                take: 10,
            })
        })

        test('should respect custom limit', async () => {
            mockPrisma.moderationCase.findMany.mockResolvedValue([])

            await service.getRecentCases(GUILD_A, 50)

            expect(mockPrisma.moderationCase.findMany).toHaveBeenCalledWith({
                where: { guildId: GUILD_A },
                orderBy: { createdAt: 'desc' },
                take: 50,
            })
        })
    })

    describe('getActiveWarningsCount', () => {
        test('should count active warnings for a user', async () => {
            mockPrisma.moderationCase.count.mockResolvedValue(3)

            const result = await service.getActiveWarningsCount(GUILD_A, USER_A)

            expect(result).toBe(3)
            expect(mockPrisma.moderationCase.count).toHaveBeenCalledWith({
                where: {
                    guildId: GUILD_A,
                    userId: USER_A,
                    type: 'warn',
                    active: true,
                },
            })
        })
    })

    describe('clearWarnings', () => {
        test('should deactivate all active warnings for a user', async () => {
            mockPrisma.moderationCase.updateMany.mockResolvedValue({
                count: 5,
            })

            const result = await service.clearWarnings(GUILD_A, USER_A)

            expect(result).toBe(5)
            expect(mockPrisma.moderationCase.updateMany).toHaveBeenCalledWith({
                where: {
                    guildId: GUILD_A,
                    userId: USER_A,
                    type: 'warn',
                    active: true,
                },
                data: { active: false },
            })
        })
    })

    describe('deactivateCase', () => {
        test('should deactivate a case by id', async () => {
            mockPrisma.moderationCase.update.mockResolvedValue({
                id: 'case-1',
                active: false,
            })

            const result = await service.deactivateCase('case-1')

            expect(result.active).toBe(false)
            expect(mockPrisma.moderationCase.update).toHaveBeenCalledWith({
                where: { id: 'case-1' },
                data: { active: false },
            })
        })
    })

    describe('appealCase', () => {
        test('should submit an appeal', async () => {
            mockPrisma.moderationCase.update.mockResolvedValue({
                id: 'case-1',
                appealed: true,
                appealReason: 'I was wrongly banned',
            })

            const result = await service.appealCase({
                caseId: 'case-1',
                appealReason: 'I was wrongly banned',
            })

            expect(result.appealed).toBe(true)
            expect(mockPrisma.moderationCase.update).toHaveBeenCalledWith({
                where: { id: 'case-1' },
                data: expect.objectContaining({
                    appealed: true,
                    appealReason: 'I was wrongly banned',
                }),
            })
        })
    })

    describe('reviewAppeal', () => {
        test('should approve appeal and deactivate case', async () => {
            mockPrisma.moderationCase.update.mockResolvedValue({
                id: 'case-1',
                appealReviewed: true,
                active: false,
            })

            const result = await service.reviewAppeal('case-1', true)

            expect(result.active).toBe(false)
            expect(mockPrisma.moderationCase.update).toHaveBeenCalledWith({
                where: { id: 'case-1' },
                data: expect.objectContaining({
                    appealReviewed: true,
                    appealApproved: true,
                    active: false,
                }),
            })
        })

        test('should deny appeal without deactivating case', async () => {
            mockPrisma.moderationCase.update.mockResolvedValue({
                id: 'case-1',
                appealReviewed: true,
                appealApproved: false,
                active: true,
            })

            await service.reviewAppeal('case-1', false)

            expect(mockPrisma.moderationCase.update).toHaveBeenCalledWith({
                where: { id: 'case-1' },
                data: {
                    appealReviewed: true,
                    appealApproved: false,
                },
            })
        })
    })

    describe('getExpiredCases', () => {
        test('should return active cases past expiration', async () => {
            const expired = [
                { id: 'c1', active: true, expiresAt: new Date('2020-01-01') },
            ]
            mockPrisma.moderationCase.findMany.mockResolvedValue(expired)

            const result = await service.getExpiredCases()

            expect(result).toHaveLength(1)
            expect(mockPrisma.moderationCase.findMany).toHaveBeenCalledWith({
                where: {
                    active: true,
                    expiresAt: { lte: expect.any(Date) },
                },
            })
        })
    })

    describe('getSettings', () => {
        test('should delegate to getModerationSettings', async () => {
            const settings = {
                id: 's1',
                guildId: GUILD_A,
                modRoleIds: ['role1'],
                adminRoleIds: ['role2'],
            }
            mockModerationSettings.getModerationSettings.mockResolvedValue(
                settings,
            )

            const result = await service.getSettings(GUILD_A)

            expect(result).toEqual(settings)
            expect(
                mockModerationSettings.getModerationSettings,
            ).toHaveBeenCalledWith(GUILD_A)
        })
    })

    describe('updateSettings', () => {
        test('should delegate to updateModerationSettings', async () => {
            const updated = {
                id: 's1',
                guildId: GUILD_A,
                modRoleIds: ['role1'],
            }
            mockModerationSettings.updateModerationSettings.mockResolvedValue(
                updated,
            )

            const result = await service.updateSettings(GUILD_A, {
                modRoleIds: ['role1'],
            })

            expect(result.modRoleIds).toEqual(['role1'])
            expect(
                mockModerationSettings.updateModerationSettings,
            ).toHaveBeenCalledWith(GUILD_A, { modRoleIds: ['role1'] })
        })
    })

    describe('hasModPermissions', () => {
        test('should delegate to hasModPermissions helper', async () => {
            mockModerationSettings.hasModPermissions.mockResolvedValue(true)

            const result = await service.hasModPermissions(GUILD_A, [
                'mod-role',
            ])

            expect(result).toBe(true)
            expect(
                mockModerationSettings.hasModPermissions,
            ).toHaveBeenCalledWith(GUILD_A, ['mod-role'])
        })

        test('should return false when no permissions', async () => {
            mockModerationSettings.hasModPermissions.mockResolvedValue(false)

            const result = await service.hasModPermissions(GUILD_A, [
                'random-role',
            ])

            expect(result).toBe(false)
        })
    })

    describe('getStats', () => {
        test('should delegate to getModerationStats', async () => {
            const stats = {
                totalCases: 100,
                activeCases: 25,
                casesByType: {
                    warn: 50,
                    ban: 30,
                    mute: 20,
                },
            }
            mockModerationSettings.getModerationStats.mockResolvedValue(stats)

            const result = await service.getStats(GUILD_A)

            expect(result.totalCases).toBe(100)
            expect(result.activeCases).toBe(25)
            expect(result.casesByType).toEqual({
                warn: 50,
                ban: 30,
                mute: 20,
            })
            expect(
                mockModerationSettings.getModerationStats,
            ).toHaveBeenCalledWith(GUILD_A)
        })
    })
})
