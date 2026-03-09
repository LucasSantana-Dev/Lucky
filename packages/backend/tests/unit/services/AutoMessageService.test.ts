import { describe, test, expect, beforeEach, jest } from '@jest/globals'

const mockPrisma: any = {
    autoMessage: {
        create: jest.fn<any>(),
        findMany: jest.fn<any>(),
        update: jest.fn<any>(),
        delete: jest.fn<any>(),
    },
}

jest.mock('@lucky/shared/utils/database/prismaClient', () => ({
    getPrismaClient: () => mockPrisma,
}))

import { AutoMessageService } from '@lucky/shared/services/AutoMessageService'

describe('AutoMessageService', () => {
    let service: InstanceType<typeof AutoMessageService>

    const GUILD_A = '111111111111111111'
    const GUILD_B = '222222222222222222'

    beforeEach(() => {
        jest.clearAllMocks()
        service = new AutoMessageService()
    })

    describe('createMessage', () => {
        test('should create a welcome message', async () => {
            mockPrisma.autoMessage.create.mockResolvedValue({
                id: 'msg-1',
                guildId: GUILD_A,
                type: 'welcome',
                message: 'Welcome {user}!',
                channelId: 'ch-1',
                enabled: true,
            })

            const result = await service.createMessage(
                GUILD_A,
                'welcome',
                { message: 'Welcome {user}!' },
                { channelId: 'ch-1' },
            )

            expect(result.type).toBe('welcome')
            expect(result.message).toBe('Welcome {user}!')
            expect(mockPrisma.autoMessage.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        guildId: GUILD_A,
                        type: 'welcome',
                        message: 'Welcome {user}!',
                        channelId: 'ch-1',
                    }),
                }),
            )
        })

        test('should create a leave message', async () => {
            mockPrisma.autoMessage.create.mockResolvedValue({
                id: 'msg-2',
                guildId: GUILD_A,
                type: 'leave',
                message: 'Goodbye {user}!',
            })

            const result = await service.createMessage(GUILD_A, 'leave', {
                message: 'Goodbye {user}!',
            })

            expect(result.type).toBe('leave')
        })

        test('should create auto-response with trigger', async () => {
            mockPrisma.autoMessage.create.mockResolvedValue({
                id: 'msg-3',
                guildId: GUILD_A,
                type: 'auto_response',
                message: 'Check the FAQ!',
                trigger: 'help',
            })

            const result = await service.createMessage(
                GUILD_A,
                'auto_response',
                { message: 'Check the FAQ!' },
                { trigger: 'help', exactMatch: true },
            )

            expect(result.type).toBe('auto_response')
        })
    })

    describe('getMessagesByType', () => {
        test('should return messages filtered by type and enabled', async () => {
            const messages = [
                { id: 'msg-1', type: 'welcome', guildId: GUILD_A },
            ]
            mockPrisma.autoMessage.findMany.mockResolvedValue(messages)

            const result = await service.getMessagesByType(GUILD_A, 'welcome')

            expect(result).toHaveLength(1)
            expect(mockPrisma.autoMessage.findMany).toHaveBeenCalledWith({
                where: { guildId: GUILD_A, type: 'welcome', enabled: true },
            })
        })

        test('should isolate messages per guild (multi-server)', async () => {
            mockPrisma.autoMessage.findMany
                .mockResolvedValueOnce([{ type: 'welcome', guildId: GUILD_A }])
                .mockResolvedValueOnce([])

            const resultA = await service.getMessagesByType(GUILD_A, 'welcome')
            const resultB = await service.getMessagesByType(GUILD_B, 'welcome')

            expect(resultA).toHaveLength(1)
            expect(resultB).toHaveLength(0)
        })
    })

    describe('getWelcomeMessage', () => {
        test('should return enabled welcome message', async () => {
            const msg = {
                id: 'msg-1',
                type: 'welcome',
                enabled: true,
                guildId: GUILD_A,
            }
            mockPrisma.autoMessage.findMany.mockResolvedValue([msg])

            const result = await service.getWelcomeMessage(GUILD_A)

            expect(result).toEqual(msg)
            expect(mockPrisma.autoMessage.findMany).toHaveBeenCalledWith({
                where: { guildId: GUILD_A, type: 'welcome', enabled: true },
            })
        })

        test('should return null when no welcome message exists', async () => {
            mockPrisma.autoMessage.findMany.mockResolvedValue([])

            const result = await service.getWelcomeMessage(GUILD_A)

            expect(result).toBeNull()
        })
    })

    describe('getLeaveMessage', () => {
        test('should return enabled leave message', async () => {
            const msg = {
                id: 'msg-1',
                type: 'leave',
                enabled: true,
                guildId: GUILD_A,
            }
            mockPrisma.autoMessage.findMany.mockResolvedValue([msg])

            const result = await service.getLeaveMessage(GUILD_A)

            expect(result).toEqual(msg)
            expect(mockPrisma.autoMessage.findMany).toHaveBeenCalledWith({
                where: { guildId: GUILD_A, type: 'leave', enabled: true },
            })
        })
    })

    describe('updateMessage', () => {
        test('should update message by id', async () => {
            mockPrisma.autoMessage.update.mockResolvedValue({
                id: 'msg-1',
                message: 'Updated welcome!',
                enabled: true,
            })

            const result = await service.updateMessage('msg-1', {
                message: 'Updated welcome!',
            })

            expect(result.message).toBe('Updated welcome!')
            expect(mockPrisma.autoMessage.update).toHaveBeenCalledWith({
                where: { id: 'msg-1' },
                data: { message: 'Updated welcome!' },
            })
        })

        test('should toggle message enabled state', async () => {
            mockPrisma.autoMessage.update.mockResolvedValue({
                id: 'msg-1',
                enabled: false,
            })

            const result = await service.updateMessage('msg-1', {
                enabled: false,
            })

            expect(result.enabled).toBe(false)
        })
    })

    describe('deleteMessage', () => {
        test('should delete message by id', async () => {
            mockPrisma.autoMessage.delete.mockResolvedValue({ id: 'msg-1' })

            await service.deleteMessage('msg-1')

            expect(mockPrisma.autoMessage.delete).toHaveBeenCalledWith({
                where: { id: 'msg-1' },
            })
        })
    })

    describe('toggleMessage', () => {
        test('should toggle message enabled state', async () => {
            mockPrisma.autoMessage.update.mockResolvedValue({
                id: 'msg-1',
                enabled: false,
            })

            const result = await service.toggleMessage('msg-1', false)

            expect(result.enabled).toBe(false)
            expect(mockPrisma.autoMessage.update).toHaveBeenCalledWith({
                where: { id: 'msg-1' },
                data: { enabled: false },
            })
        })
    })

    describe('replacePlaceholders', () => {
        test('should replace {user} placeholder', () => {
            const result = service.replacePlaceholders(
                'Welcome {user} to the server!',
                {
                    user: {
                        username: 'TestUser',
                        mention: '<@123>',
                        id: '123',
                    },
                    server: {
                        name: 'TestServer',
                        memberCount: 100,
                    },
                },
            )

            expect(result).toBe('Welcome TestUser to the server!')
        })

        test('should replace multiple placeholders', () => {
            const result = service.replacePlaceholders(
                '{user} joined {server}! We now have {server.memberCount} members.',
                {
                    user: {
                        username: 'Alice',
                        mention: '<@456>',
                        id: '456',
                    },
                    server: {
                        name: 'MyGuild',
                        memberCount: 50,
                    },
                },
            )

            expect(result).toBe('Alice joined MyGuild! We now have 50 members.')
        })

        test('should replace user.mention placeholder', () => {
            const result = service.replacePlaceholders(
                'Hey {user.mention}, welcome!',
                {
                    user: {
                        username: 'Bob',
                        mention: '<@789>',
                        id: '789',
                    },
                },
            )

            expect(result).toBe('Hey <@789>, welcome!')
        })

        test('should replace guild.name and guild.memberCount', () => {
            const result = service.replacePlaceholders(
                'Welcome to {guild.name} with {guild.memberCount} members!',
                {
                    guild: {
                        name: 'TestGuild',
                        memberCount: 250,
                    },
                },
            )

            expect(result).toBe('Welcome to TestGuild with 250 members!')
        })

        test('should handle missing placeholders gracefully', () => {
            const result = service.replacePlaceholders(
                'Hello {user}! Welcome to {server}!',
                {
                    user: {
                        username: 'Bob',
                        mention: '<@999>',
                        id: '999',
                    },
                },
            )

            expect(result).toContain('Bob')
            expect(result).toContain('{server}')
        })
    })

    describe('findMatchingResponder', () => {
        test('should find matching auto-responder', async () => {
            mockPrisma.autoMessage.findMany.mockResolvedValue([
                {
                    id: 'msg-1',
                    type: 'auto_response',
                    trigger: 'help',
                    exactMatch: false,
                    message: 'Check the FAQ!',
                    enabled: true,
                },
            ])

            const result = await service.findMatchingResponder(
                GUILD_A,
                'I need help please',
            )

            expect(result).not.toBeNull()
            expect(result?.message).toBe('Check the FAQ!')
            expect(mockPrisma.autoMessage.findMany).toHaveBeenCalledWith({
                where: {
                    guildId: GUILD_A,
                    type: 'auto_response',
                    enabled: true,
                },
            })
        })

        test('should respect exact match setting', async () => {
            mockPrisma.autoMessage.findMany.mockResolvedValue([
                {
                    id: 'msg-1',
                    type: 'auto_response',
                    trigger: 'help',
                    exactMatch: true,
                    message: 'Check the FAQ!',
                    enabled: true,
                },
            ])

            const result = await service.findMatchingResponder(
                GUILD_A,
                'I need help please',
            )

            expect(result).toBeNull()
        })

        test('should match exact responder when exactMatch is true', async () => {
            mockPrisma.autoMessage.findMany.mockResolvedValue([
                {
                    id: 'msg-1',
                    type: 'auto_response',
                    trigger: 'help',
                    exactMatch: true,
                    message: 'Exact match!',
                    enabled: true,
                },
            ])

            const result = await service.findMatchingResponder(GUILD_A, 'help')

            expect(result).not.toBeNull()
            expect(result?.message).toBe('Exact match!')
        })
    })
})
