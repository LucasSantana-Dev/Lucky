import { describe, test, expect, beforeEach, jest } from '@jest/globals'

const mockPrisma: any = {
    serverLog: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        deleteMany: jest.fn(),
        groupBy: jest.fn(),
    },
}

jest.unstable_mockModule('@lukbot/shared/utils/database/prismaClient', () => ({
    getPrismaClient: () => mockPrisma,
    prisma: mockPrisma,
}))

describe('ServerLogService', () => {
    let service: any
    let ServerLogService: any

    const GUILD_A = '111111111111111111'
    const GUILD_B = '222222222222222222'
    const USER_A = '333333333333333333'
    const MOD_A = '555555555555555555'

    beforeAll(async () => {
        const module = await import('@lukbot/shared/services')
        ServerLogService = module.ServerLogService
    })

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
        })
    })

    describe('getRecentLogs', () => {
        test('should return recent logs with default limit', async () => {
            mockPrisma.serverLog.findMany.mockResolvedValue([])

            await service.getRecentLogs(GUILD_A)

            expect(mockPrisma.serverLog.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { guildId: GUILD_A },
                    take: 50,
                }),
            )
        })

        test('should respect custom limit', async () => {
            mockPrisma.serverLog.findMany.mockResolvedValue([])

            await service.getRecentLogs(GUILD_A, 100)

            expect(mockPrisma.serverLog.findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    take: 100,
                }),
            )
        })
    })

    describe('searchLogs', () => {
        test('should search logs by query string', async () => {
            mockPrisma.serverLog.findMany.mockResolvedValue([
                { id: 'log-1', action: 'User warned' },
            ])

            const result = await service.searchLogs(GUILD_A, 'warned')

            expect(result).toHaveLength(1)
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

            expect(result).toBeDefined()
        })
    })

    describe('logModerationAction', () => {
        test('should create a mod_action log entry', async () => {
            mockPrisma.serverLog.create.mockResolvedValue({
                id: 'log-1',
                guildId: GUILD_A,
                type: 'mod_action',
                action: 'User warned',
            })

            await service.logModerationAction(
                GUILD_A,
                'User warned',
                {
                    caseNumber: 1,
                    type: 'warn',
                    userId: USER_A,
                    username: 'testuser',
                    reason: 'Spamming',
                    silent: false,
                },
                MOD_A,
            )

            expect(mockPrisma.serverLog.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        guildId: GUILD_A,
                        type: 'mod_action',
                        action: 'User warned',
                    }),
                }),
            )
        })

        test('should include moderator ID in log', async () => {
            mockPrisma.serverLog.create.mockResolvedValue({ id: 'log-1' })

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

            expect(mockPrisma.serverLog.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        moderatorId: MOD_A,
                    }),
                }),
            )
        })
    })

    describe('logCaseUpdate', () => {
        test('should log case reason update', async () => {
            mockPrisma.serverLog.create.mockResolvedValue({ id: 'log-1' })

            await service.logCaseUpdate(
                GUILD_A,
                {
                    caseNumber: 1,
                    changeType: 'reason_update',
                    oldValue: 'Old reason',
                    newValue: 'New reason',
                },
                MOD_A,
            )

            expect(mockPrisma.serverLog.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        guildId: GUILD_A,
                        type: 'mod_case_update',
                        action: 'Case #1 reason_update',
                    }),
                }),
            )
        })

        test('should log case deactivation', async () => {
            mockPrisma.serverLog.create.mockResolvedValue({ id: 'log-1' })

            await service.logCaseUpdate(
                GUILD_A,
                {
                    caseNumber: 5,
                    changeType: 'deactivated',
                },
                MOD_A,
            )

            expect(mockPrisma.serverLog.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        action: 'Case #5 deactivated',
                    }),
                }),
            )
        })
    })

    describe('logAutoModTrigger', () => {
        test('should log auto-mod trigger event', async () => {
            mockPrisma.serverLog.create.mockResolvedValue({ id: 'log-1' })

            await service.logAutoModTrigger(
                GUILD_A,
                {
                    rule: 'spam',
                    action: 'mute',
                    messageContent: 'spam spam spam',
                    channelId: 'ch-1',
                },
                USER_A,
            )

            expect(mockPrisma.serverLog.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        guildId: GUILD_A,
                        type: 'automod_trigger',
                        action: 'AutoMod: spam',
                    }),
                }),
            )
        })
    })

    describe('logAutoModSettingsChange', () => {
        test('should log auto-mod settings change', async () => {
            mockPrisma.serverLog.create.mockResolvedValue({ id: 'log-1' })

            await service.logAutoModSettingsChange(
                GUILD_A,
                {
                    module: 'spam',
                    enabled: true,
                    changes: { spamThreshold: 5 },
                },
                MOD_A,
            )

            expect(mockPrisma.serverLog.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        type: 'automod_settings',
                        action: 'AutoMod spam enabled',
                    }),
                }),
            )
        })
    })

    describe('logCustomCommandChange', () => {
        test('should log custom command creation', async () => {
            mockPrisma.serverLog.create.mockResolvedValue({ id: 'log-1' })

            await service.logCustomCommandChange(
                GUILD_A,
                'created',
                { commandName: 'hello' },
                MOD_A,
            )

            expect(mockPrisma.serverLog.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        type: 'custom_command',
                        action: 'Custom command created: hello',
                    }),
                }),
            )
        })

        test('should log custom command deletion', async () => {
            mockPrisma.serverLog.create.mockResolvedValue({ id: 'log-1' })

            await service.logCustomCommandChange(
                GUILD_A,
                'deleted',
                { commandName: 'bye' },
                MOD_A,
            )

            expect(mockPrisma.serverLog.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        action: 'Custom command deleted: bye',
                    }),
                }),
            )
        })
    })

    describe('logEmbedTemplateChange', () => {
        test('should log embed template sent', async () => {
            mockPrisma.serverLog.create.mockResolvedValue({ id: 'log-1' })

            await service.logEmbedTemplateChange(
                GUILD_A,
                'sent',
                { templateName: 'welcome', channelId: 'ch-1' },
                MOD_A,
            )

            expect(mockPrisma.serverLog.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        type: 'embed_template',
                        action: 'Embed template sent: welcome',
                    }),
                }),
            )
        })
    })

    describe('logAutoMessageChange', () => {
        test('should log auto-message enabled', async () => {
            mockPrisma.serverLog.create.mockResolvedValue({ id: 'log-1' })

            await service.logAutoMessageChange(
                GUILD_A,
                'enabled',
                { type: 'welcome', channelId: 'ch-1' },
                MOD_A,
            )

            expect(mockPrisma.serverLog.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        type: 'auto_message',
                        action: 'Auto-message welcome enabled',
                    }),
                }),
            )
        })
    })

    describe('logSettingsChange', () => {
        test('should log settings change with old and new values', async () => {
            mockPrisma.serverLog.create.mockResolvedValue({ id: 'log-1' })

            await service.logSettingsChange(
                GUILD_A,
                {
                    setting: 'modLogChannel',
                    oldValue: null,
                    newValue: 'ch-1',
                },
                MOD_A,
            )

            expect(mockPrisma.serverLog.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        type: 'settings_change',
                        action: 'Setting changed: modLogChannel',
                    }),
                }),
            )
        })
    })

    describe('convenience log methods', () => {
        test('logMessageDelete should create message_delete log', async () => {
            mockPrisma.serverLog.create.mockResolvedValue({ id: 'log-1' })

            await service.logMessageDelete(
                GUILD_A,
                USER_A,
                'ch-1',
                'deleted message content',
            )

            expect(mockPrisma.serverLog.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        type: 'message_delete',
                    }),
                }),
            )
        })

        test('logMessageEdit should create message_edit log', async () => {
            mockPrisma.serverLog.create.mockResolvedValue({ id: 'log-1' })

            await service.logMessageEdit(
                GUILD_A,
                USER_A,
                'ch-1',
                'old content',
                'new content',
            )

            expect(mockPrisma.serverLog.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        type: 'message_edit',
                    }),
                }),
            )
        })

        test('logMemberJoin should create member_join log', async () => {
            mockPrisma.serverLog.create.mockResolvedValue({ id: 'log-1' })

            await service.logMemberJoin(GUILD_A, USER_A)

            expect(mockPrisma.serverLog.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        type: 'member_join',
                    }),
                }),
            )
        })

        test('logMemberLeave should create member_leave log', async () => {
            mockPrisma.serverLog.create.mockResolvedValue({ id: 'log-1' })

            await service.logMemberLeave(GUILD_A, USER_A)

            expect(mockPrisma.serverLog.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        type: 'member_leave',
                    }),
                }),
            )
        })

        test('logVoiceState should create voice_state log', async () => {
            mockPrisma.serverLog.create.mockResolvedValue({ id: 'log-1' })

            await service.logVoiceState(GUILD_A, USER_A, 'join', 'voice-ch-1')

            expect(mockPrisma.serverLog.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        type: 'voice_state',
                    }),
                }),
            )
        })
    })
})
