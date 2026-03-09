import { describe, test, expect, beforeEach, jest } from '@jest/globals'

const mockPrisma: any = {
    serverLog: {
        create: jest.fn<any>(),
        findMany: jest.fn<any>(),
        count: jest.fn<any>(),
        deleteMany: jest.fn<any>(),
        groupBy: jest.fn<any>(),
    },
}

jest.mock('@lucky/shared/utils/database/prismaClient', () => ({
    getPrismaClient: () => mockPrisma,
}))

const mockHelpers = {
    logMessageDelete: jest.fn<any>(),
    logMessageEdit: jest.fn<any>(),
    logMemberJoin: jest.fn<any>(),
    logMemberLeave: jest.fn<any>(),
    logRoleUpdate: jest.fn<any>(),
    logVoiceState: jest.fn<any>(),
    logModerationAction: jest.fn<any>(),
    logCaseUpdate: jest.fn<any>(),
    logAutoModTrigger: jest.fn<any>(),
    logAutoModSettingsChange: jest.fn<any>(),
    logCustomCommandChange: jest.fn<any>(),
    logEmbedTemplateChange: jest.fn<any>(),
    logAutoMessageChange: jest.fn<any>(),
    logSettingsChange: jest.fn<any>(),
}

jest.mock('@lucky/shared/services/serverLogHelpers', () => mockHelpers)

import { ServerLogService } from '@lucky/shared/services/ServerLogService'

describe('ServerLogService', () => {
    let service: InstanceType<typeof ServerLogService>

    const GUILD_A = '111111111111111111'
    const GUILD_B = '222222222222222222'
    const USER_A = '333333333333333333'
    const MOD_A = '555555555555555555'

    beforeEach(() => {
        jest.clearAllMocks()
        service = new ServerLogService()
    })

    describe('createLog', () => {
        test('should create a log entry', async () => {
            mockPrisma.serverLog.create.mockResolvedValue({
                id: 'log-1',
                guildId: GUILD_A,
                type: 'message_delete',
                action: 'Message deleted',
            })

            const result = await service.createLog(
                GUILD_A,
                'message_delete',
                'Message deleted',
                { content: 'deleted text' },
                { userId: USER_A, channelId: 'ch-1' },
            )

            expect(result.guildId).toBe(GUILD_A)
            expect(mockPrisma.serverLog.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        guildId: GUILD_A,
                        type: 'message_delete',
                        action: 'Message deleted',
                        details: JSON.stringify({ content: 'deleted text' }),
                        userId: USER_A,
                        channelId: 'ch-1',
                    }),
                }),
            )
        })
    })

    describe('getLogsByType', () => {
        test('should return logs filtered by type', async () => {
            const logs = [
                { id: 'log-1', type: 'mod_action', guildId: GUILD_A },
                { id: 'log-2', type: 'mod_action', guildId: GUILD_A },
            ]
            mockPrisma.serverLog.findMany.mockResolvedValue(logs)

            const result = await service.getLogsByType(GUILD_A, 'mod_action')

            expect(result).toHaveLength(2)
            expect(mockPrisma.serverLog.findMany).toHaveBeenCalledWith({
                where: { guildId: GUILD_A, type: 'mod_action' },
                orderBy: { createdAt: 'desc' },
                take: 50,
            })
        })

        test('should isolate logs per guild (multi-server)', async () => {
            mockPrisma.serverLog.findMany
                .mockResolvedValueOnce([{ guildId: GUILD_A }])
                .mockResolvedValueOnce([])

            const resultA = await service.getLogsByType(GUILD_A, 'mod_action')
            const resultB = await service.getLogsByType(GUILD_B, 'mod_action')

            expect(resultA).toHaveLength(1)
            expect(resultB).toHaveLength(0)
        })
    })

    describe('getUserLogs', () => {
        test('should return logs for a specific user', async () => {
            mockPrisma.serverLog.findMany.mockResolvedValue([
                { id: 'log-1', userId: USER_A },
            ])

            const result = await service.getUserLogs(GUILD_A, USER_A)

            expect(result).toHaveLength(1)
            expect(mockPrisma.serverLog.findMany).toHaveBeenCalledWith({
                where: { guildId: GUILD_A, userId: USER_A },
                orderBy: { createdAt: 'desc' },
                take: 50,
            })
        })
    })

    describe('getRecentLogs', () => {
        test('should return recent logs with default limit', async () => {
            mockPrisma.serverLog.findMany.mockResolvedValue([])

            await service.getRecentLogs(GUILD_A)

            expect(mockPrisma.serverLog.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { guildId: GUILD_A },
                    take: 100,
                }),
            )
        })

        test('should respect custom limit', async () => {
            mockPrisma.serverLog.findMany.mockResolvedValue([])

            await service.getRecentLogs(GUILD_A, 200)

            expect(mockPrisma.serverLog.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    take: 200,
                }),
            )
        })
    })

    describe('searchLogs', () => {
        test('should search logs with filters', async () => {
            mockPrisma.serverLog.findMany.mockResolvedValue([
                { id: 'log-1', action: 'User warned' },
            ])

            const result = await service.searchLogs(GUILD_A, {
                type: 'mod_action',
                userId: USER_A,
            })

            expect(result).toHaveLength(1)
            expect(mockPrisma.serverLog.findMany).toHaveBeenCalledWith({
                where: {
                    guildId: GUILD_A,
                    type: 'mod_action',
                    userId: USER_A,
                },
                orderBy: { createdAt: 'desc' },
                take: 100,
            })
        })

        test('should filter by date range', async () => {
            mockPrisma.serverLog.findMany.mockResolvedValue([])

            const startDate = new Date('2024-01-01')
            const endDate = new Date('2024-12-31')

            await service.searchLogs(GUILD_A, { startDate, endDate })

            expect(mockPrisma.serverLog.findMany).toHaveBeenCalledWith({
                where: {
                    guildId: GUILD_A,
                    createdAt: { gte: startDate, lte: endDate },
                },
                orderBy: { createdAt: 'desc' },
                take: 100,
            })
        })
    })

    describe('deleteOldLogs', () => {
        test('should delete logs older than specified days', async () => {
            mockPrisma.serverLog.deleteMany.mockResolvedValue({ count: 50 })

            const result = await service.deleteOldLogs(GUILD_A, 30)

            expect(result).toBe(50)
            expect(mockPrisma.serverLog.deleteMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        guildId: GUILD_A,
                        createdAt: { lt: expect.any(Date) },
                    }),
                }),
            )
        })
    })

    describe('getStats', () => {
        test('should return log statistics', async () => {
            mockPrisma.serverLog.count.mockResolvedValue(200)
            mockPrisma.serverLog.groupBy.mockResolvedValue([
                { type: 'mod_action', _count: 100 },
                { type: 'message_delete', _count: 50 },
                { type: 'member_join', _count: 50 },
            ])

            const result = await service.getStats(GUILD_A)

            expect(result.totalLogs).toBe(200)
            expect(result.logsByType).toEqual({
                mod_action: 100,
                message_delete: 50,
                member_join: 50,
            })
        })
    })

    describe('convenience log methods', () => {
        test('logMessageDelete should delegate to helper', async () => {
            mockHelpers.logMessageDelete.mockResolvedValue({ id: 'log-1' })

            await service.logMessageDelete(
                GUILD_A,
                'msg-1',
                'ch-1',
                USER_A,
                'deleted message content',
            )

            expect(mockHelpers.logMessageDelete).toHaveBeenCalledWith(
                service,
                GUILD_A,
                'msg-1',
                'ch-1',
                USER_A,
                'deleted message content',
                undefined,
            )
        })

        test('logMessageEdit should delegate to helper', async () => {
            mockHelpers.logMessageEdit.mockResolvedValue({ id: 'log-1' })

            await service.logMessageEdit(
                GUILD_A,
                'msg-1',
                'ch-1',
                USER_A,
                'old content',
                'new content',
            )

            expect(mockHelpers.logMessageEdit).toHaveBeenCalledWith(
                service,
                GUILD_A,
                'msg-1',
                'ch-1',
                USER_A,
                'old content',
                'new content',
            )
        })

        test('logMemberJoin should delegate to helper', async () => {
            mockHelpers.logMemberJoin.mockResolvedValue({ id: 'log-1' })

            const accountCreated = new Date('2024-01-01')
            await service.logMemberJoin(
                GUILD_A,
                USER_A,
                'testuser',
                accountCreated,
            )

            expect(mockHelpers.logMemberJoin).toHaveBeenCalledWith(
                service,
                GUILD_A,
                USER_A,
                'testuser',
                accountCreated,
            )
        })

        test('logMemberLeave should delegate to helper', async () => {
            mockHelpers.logMemberLeave.mockResolvedValue({ id: 'log-1' })

            await service.logMemberLeave(GUILD_A, USER_A, 'testuser', [
                'role-1',
            ])

            expect(mockHelpers.logMemberLeave).toHaveBeenCalledWith(
                service,
                GUILD_A,
                USER_A,
                'testuser',
                ['role-1'],
            )
        })

        test('logVoiceState should delegate to helper', async () => {
            mockHelpers.logVoiceState.mockResolvedValue({ id: 'log-1' })

            await service.logVoiceState(GUILD_A, USER_A, 'join', 'voice-ch-1')

            expect(mockHelpers.logVoiceState).toHaveBeenCalledWith(
                service,
                GUILD_A,
                USER_A,
                'join',
                'voice-ch-1',
                undefined,
            )
        })
    })

    describe('logModerationAction', () => {
        test('should delegate to helper with correct arguments', async () => {
            mockHelpers.logModerationAction.mockResolvedValue({ id: 'log-1' })

            const details = {
                caseNumber: 1,
                type: 'warn',
                userId: USER_A,
                username: 'testuser',
                reason: 'Spamming',
                silent: false,
            }

            await service.logModerationAction(
                GUILD_A,
                'User warned',
                details,
                MOD_A,
            )

            expect(mockHelpers.logModerationAction).toHaveBeenCalledWith(
                service,
                GUILD_A,
                'User warned',
                details,
                MOD_A,
            )
        })

        test('should handle ban action', async () => {
            mockHelpers.logModerationAction.mockResolvedValue({ id: 'log-1' })

            await service.logModerationAction(
                GUILD_A,
                'User banned',
                {
                    caseNumber: 2,
                    type: 'ban',
                    userId: USER_A,
                    username: 'testuser',
                },
                MOD_A,
            )

            expect(mockHelpers.logModerationAction).toHaveBeenCalledWith(
                service,
                GUILD_A,
                'User banned',
                expect.objectContaining({
                    caseNumber: 2,
                    type: 'ban',
                }),
                MOD_A,
            )
        })
    })

    describe('logCaseUpdate', () => {
        test('should delegate reason update to helper', async () => {
            mockHelpers.logCaseUpdate.mockResolvedValue({ id: 'log-1' })

            const details = {
                caseNumber: 1,
                changeType: 'reason_update' as const,
                oldValue: 'Old reason',
                newValue: 'New reason',
            }

            await service.logCaseUpdate(GUILD_A, details, MOD_A)

            expect(mockHelpers.logCaseUpdate).toHaveBeenCalledWith(
                service,
                GUILD_A,
                details,
                MOD_A,
            )
        })

        test('should delegate case deactivation to helper', async () => {
            mockHelpers.logCaseUpdate.mockResolvedValue({ id: 'log-1' })

            await service.logCaseUpdate(
                GUILD_A,
                {
                    caseNumber: 5,
                    changeType: 'deactivated',
                },
                MOD_A,
            )

            expect(mockHelpers.logCaseUpdate).toHaveBeenCalledWith(
                service,
                GUILD_A,
                expect.objectContaining({
                    caseNumber: 5,
                    changeType: 'deactivated',
                }),
                MOD_A,
            )
        })
    })

    describe('logAutoModTrigger', () => {
        test('should delegate to helper', async () => {
            mockHelpers.logAutoModTrigger.mockResolvedValue({ id: 'log-1' })

            const details = {
                rule: 'spam',
                action: 'mute',
                messageContent: 'spam spam spam',
                channelId: 'ch-1',
            }

            await service.logAutoModTrigger(GUILD_A, details, USER_A)

            expect(mockHelpers.logAutoModTrigger).toHaveBeenCalledWith(
                service,
                GUILD_A,
                details,
                USER_A,
            )
        })
    })

    describe('logAutoModSettingsChange', () => {
        test('should delegate to helper', async () => {
            mockHelpers.logAutoModSettingsChange.mockResolvedValue({
                id: 'log-1',
            })

            const details = {
                module: 'spam',
                enabled: true,
                changes: { spamThreshold: 5 },
            }

            await service.logAutoModSettingsChange(GUILD_A, details, MOD_A)

            expect(mockHelpers.logAutoModSettingsChange).toHaveBeenCalledWith(
                service,
                GUILD_A,
                details,
                MOD_A,
            )
        })
    })

    describe('logCustomCommandChange', () => {
        test('should delegate command creation to helper', async () => {
            mockHelpers.logCustomCommandChange.mockResolvedValue({
                id: 'log-1',
            })

            await service.logCustomCommandChange(
                GUILD_A,
                'created',
                { commandName: 'hello' },
                MOD_A,
            )

            expect(mockHelpers.logCustomCommandChange).toHaveBeenCalledWith(
                service,
                GUILD_A,
                'created',
                { commandName: 'hello' },
                MOD_A,
            )
        })

        test('should delegate command deletion to helper', async () => {
            mockHelpers.logCustomCommandChange.mockResolvedValue({
                id: 'log-1',
            })

            await service.logCustomCommandChange(
                GUILD_A,
                'deleted',
                { commandName: 'bye' },
                MOD_A,
            )

            expect(mockHelpers.logCustomCommandChange).toHaveBeenCalledWith(
                service,
                GUILD_A,
                'deleted',
                { commandName: 'bye' },
                MOD_A,
            )
        })
    })

    describe('logEmbedTemplateChange', () => {
        test('should delegate template sent to helper', async () => {
            mockHelpers.logEmbedTemplateChange.mockResolvedValue({
                id: 'log-1',
            })

            await service.logEmbedTemplateChange(
                GUILD_A,
                'sent',
                { templateName: 'welcome', channelId: 'ch-1' },
                MOD_A,
            )

            expect(mockHelpers.logEmbedTemplateChange).toHaveBeenCalledWith(
                service,
                GUILD_A,
                'sent',
                { templateName: 'welcome', channelId: 'ch-1' },
                MOD_A,
            )
        })
    })

    describe('logAutoMessageChange', () => {
        test('should delegate to helper', async () => {
            mockHelpers.logAutoMessageChange.mockResolvedValue({ id: 'log-1' })

            await service.logAutoMessageChange(
                GUILD_A,
                'enabled',
                { type: 'welcome', channelId: 'ch-1' },
                MOD_A,
            )

            expect(mockHelpers.logAutoMessageChange).toHaveBeenCalledWith(
                service,
                GUILD_A,
                'enabled',
                { type: 'welcome', channelId: 'ch-1' },
                MOD_A,
            )
        })
    })

    describe('logSettingsChange', () => {
        test('should delegate to helper with old and new values', async () => {
            mockHelpers.logSettingsChange.mockResolvedValue({ id: 'log-1' })

            await service.logSettingsChange(
                GUILD_A,
                {
                    setting: 'modLogChannel',
                    oldValue: null,
                    newValue: 'ch-1',
                },
                MOD_A,
            )

            expect(mockHelpers.logSettingsChange).toHaveBeenCalledWith(
                service,
                GUILD_A,
                {
                    setting: 'modLogChannel',
                    oldValue: null,
                    newValue: 'ch-1',
                },
                MOD_A,
            )
        })
    })
})
