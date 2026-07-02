import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    jest,
} from '@jest/globals'
import type { Client, GuildScheduledEvent, TextChannel } from 'discord.js'
import { scheduledEventNotificationService } from './ScheduledEventNotificationService'

const getPrismaClientMock = jest.fn()
const debugLogMock = jest.fn()
const errorLogMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    debugLog: (...args: unknown[]) => debugLogMock(...args),
    errorLog: (...args: unknown[]) => errorLogMock(...args),
}))

jest.mock('@lucky/shared/utils/database/prismaClient', () => ({
    getPrismaClient: (...args: unknown[]) => getPrismaClientMock(...args),
}))

describe('ScheduledEventNotificationService', () => {
    let mockDb: any
    let mockClient: Partial<Client>
    let mockChannel: Partial<TextChannel>
    let mockEvent: Partial<GuildScheduledEvent>

    beforeEach(() => {
        jest.clearAllMocks()

        mockChannel = {
            isTextBased: jest.fn().mockReturnValue(true),
            send: jest.fn().mockResolvedValue({}),
        }

        mockClient = {
            channels: {
                fetch: jest.fn().mockResolvedValue(mockChannel),
            },
        }

        mockDb = {
            scheduledEventNotification: {
                findUnique: jest.fn(),
            },
        }

        getPrismaClientMock.mockReturnValue(mockDb)

        mockEvent = {
            id: 'event1',
            guildId: 'guild1',
            name: 'Test Event',
            description: 'This is a test event',
            scheduledStartAt: new Date('2026-07-10T15:00:00Z'),
        }
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    it('should send notification without mention when mentionRoleId is not set', async () => {
        mockDb.scheduledEventNotification.findUnique.mockResolvedValue({
            id: 'config1',
            guildId: 'guild1',
            channelId: 'channel1',
            mentionRoleId: null,
            enabled: true,
            createdAt: new Date(),
            updatedAt: new Date(),
        })

        await scheduledEventNotificationService.notifyScheduledEvent(
            mockEvent as GuildScheduledEvent,
            mockClient as Client,
        )

        expect(mockChannel.send).toHaveBeenCalledWith(
            expect.objectContaining({
                content: undefined,
                embeds: expect.any(Array),
            }),
        )
    })

    it('should send notification with mention when mentionRoleId is set', async () => {
        mockDb.scheduledEventNotification.findUnique.mockResolvedValue({
            id: 'config1',
            guildId: 'guild1',
            channelId: 'channel1',
            mentionRoleId: 'role1',
            enabled: true,
            createdAt: new Date(),
            updatedAt: new Date(),
        })

        await scheduledEventNotificationService.notifyScheduledEvent(
            mockEvent as GuildScheduledEvent,
            mockClient as Client,
        )

        expect(mockChannel.send).toHaveBeenCalledWith(
            expect.objectContaining({
                content: '<@&role1>',
                allowedMentions: { roles: ['role1'] },
                embeds: expect.any(Array),
            }),
        )
    })

    it('should not send when config is disabled', async () => {
        mockDb.scheduledEventNotification.findUnique.mockResolvedValue({
            id: 'config1',
            guildId: 'guild1',
            channelId: 'channel1',
            mentionRoleId: null,
            enabled: false,
            createdAt: new Date(),
            updatedAt: new Date(),
        })

        await scheduledEventNotificationService.notifyScheduledEvent(
            mockEvent as GuildScheduledEvent,
            mockClient as Client,
        )

        expect(mockChannel.send).not.toHaveBeenCalled()
    })

    it('should not send when config does not exist', async () => {
        mockDb.scheduledEventNotification.findUnique.mockResolvedValue(null)

        await scheduledEventNotificationService.notifyScheduledEvent(
            mockEvent as GuildScheduledEvent,
            mockClient as Client,
        )

        expect(mockChannel.send).not.toHaveBeenCalled()
    })
})
