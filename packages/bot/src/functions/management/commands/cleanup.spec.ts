import { beforeEach, describe, expect, it, jest } from '@jest/globals'
import type { ChatInputCommandInteraction } from 'discord.js'

const requireGuildMock = jest.fn()
const channelCleanupServiceMock = {
    getConfig: jest.fn(),
    upsertConfig: jest.fn(),
    disableCleanup: jest.fn(),
    listConfigs: jest.fn(),
}
const starboardServiceMock = {
    getConfig: jest.fn(),
}
const interactionReplyMock = jest.fn()

jest.mock('../../../utils/command/commandValidations', () => ({
    requireGuild: (...args: unknown[]) => requireGuildMock(...args),
}))

jest.mock('@lucky/shared/services', () => ({
    channelCleanupService: channelCleanupServiceMock,
    starboardService: starboardServiceMock,
}))

jest.mock('../../../utils/general/interactionReply', () => ({
    interactionReply: (...args: unknown[]) => interactionReplyMock(...args),
}))

jest.mock('../../../utils/general/embeds', () => ({
    createErrorEmbed: jest.fn((title, desc) => ({ title, desc })),
    createSuccessEmbed: jest.fn((title, desc) => ({ title, desc })),
}))

jest.mock('@lucky/shared/utils', () => ({
    errorLog: jest.fn(),
}))

describe('cleanup command', () => {
    let mockInteraction: Partial<ChatInputCommandInteraction>
    let cleanupCommand: any

    beforeEach(async () => {
        jest.clearAllMocks()

        mockInteraction = {
            guildId: 'guild-123',
            deferReply: jest.fn().mockResolvedValue(undefined),
            options: {
                getSubcommand: jest.fn().mockReturnValue('list'),
                getChannel: jest.fn().mockReturnValue({ id: 'channel-456' }),
                getInteger: jest.fn().mockReturnValue(60),
            },
        } as any

        requireGuildMock.mockResolvedValue(true)
        channelCleanupServiceMock.listConfigs.mockResolvedValue([])
        starboardServiceMock.getConfig.mockResolvedValue(null)
        interactionReplyMock.mockResolvedValue(undefined)

        cleanupCommand = (await import('./cleanup')).default
    })

    it('should defer reply with ephemeral', async () => {
        await cleanupCommand.execute({ interaction: mockInteraction as ChatInputCommandInteraction })
        expect(mockInteraction.deferReply).toHaveBeenCalledWith({ flags: 64 })
    })

    it('should return early if requireGuild fails', async () => {
        requireGuildMock.mockResolvedValue(false)

        await cleanupCommand.execute({ interaction: mockInteraction as ChatInputCommandInteraction })

        expect(mockInteraction.deferReply).not.toHaveBeenCalled()
    })

    describe('set-interval subcommand', () => {
        beforeEach(() => {
            ;(mockInteraction.options as any).getSubcommand.mockReturnValue('set-interval')
        })

        it('should configure purge interval', async () => {
            await cleanupCommand.execute({ interaction: mockInteraction as ChatInputCommandInteraction })

            expect(channelCleanupServiceMock.upsertConfig).toHaveBeenCalledWith(
                'guild-123',
                'channel-456',
                {
                    mode: 'purge_interval',
                    intervalMinutes: 60,
                    ttlSeconds: null,
                    enabled: true,
                },
            )
        })

        it('should prevent purge on starboard channel', async () => {
            starboardServiceMock.getConfig.mockResolvedValue({
                guildId: 'guild-123',
                channelId: 'channel-456',
            })

            await cleanupCommand.execute({ interaction: mockInteraction as ChatInputCommandInteraction })

            expect(interactionReplyMock).toHaveBeenCalled()
            expect(channelCleanupServiceMock.upsertConfig).not.toHaveBeenCalled()
        })
    })

    describe('set-ttl subcommand', () => {
        beforeEach(() => {
            ;(mockInteraction.options as any).getSubcommand.mockReturnValue('set-ttl')
            ;(mockInteraction.options as any).getInteger.mockReturnValue(300) // 5 minutes
        })

        it('should configure TTL delete', async () => {
            await cleanupCommand.execute({ interaction: mockInteraction as ChatInputCommandInteraction })

            expect(channelCleanupServiceMock.upsertConfig).toHaveBeenCalledWith(
                'guild-123',
                'channel-456',
                {
                    mode: 'ttl',
                    intervalMinutes: null,
                    ttlSeconds: 300,
                    enabled: true,
                },
            )
        })

        it('should prevent TTL on starboard channel', async () => {
            starboardServiceMock.getConfig.mockResolvedValue({
                guildId: 'guild-123',
                channelId: 'channel-456',
            })

            await cleanupCommand.execute({ interaction: mockInteraction as ChatInputCommandInteraction })

            expect(interactionReplyMock).toHaveBeenCalled()
            expect(channelCleanupServiceMock.upsertConfig).not.toHaveBeenCalled()
        })
    })

    describe('disable subcommand', () => {
        beforeEach(() => {
            ;(mockInteraction.options as any).getSubcommand.mockReturnValue('disable')
        })

        it('should disable cleanup for channel', async () => {
            channelCleanupServiceMock.getConfig.mockResolvedValue({
                id: 'config-1',
                enabled: true,
            })

            await cleanupCommand.execute({ interaction: mockInteraction as ChatInputCommandInteraction })

            expect(channelCleanupServiceMock.disableCleanup).toHaveBeenCalledWith('guild-123', 'channel-456')
        })

        it('should show error if channel has no config', async () => {
            channelCleanupServiceMock.getConfig.mockResolvedValue(null)

            await cleanupCommand.execute({ interaction: mockInteraction as ChatInputCommandInteraction })

            expect(channelCleanupServiceMock.disableCleanup).not.toHaveBeenCalled()
            expect(interactionReplyMock).toHaveBeenCalled()
        })
    })

    describe('list subcommand', () => {
        beforeEach(() => {
            ;(mockInteraction.options as any).getSubcommand.mockReturnValue('list')
        })

        it('should list all configs', async () => {
            const configs = [
                {
                    id: 'config-1',
                    channelId: 'channel-1',
                    mode: 'ttl',
                    ttlSeconds: 60,
                    enabled: true,
                },
            ]
            channelCleanupServiceMock.listConfigs.mockResolvedValue(configs)

            await cleanupCommand.execute({ interaction: mockInteraction as ChatInputCommandInteraction })

            expect(channelCleanupServiceMock.listConfigs).toHaveBeenCalledWith('guild-123')
            expect(interactionReplyMock).toHaveBeenCalled()
        })

        it('should show empty message if no configs', async () => {
            channelCleanupServiceMock.listConfigs.mockResolvedValue([])

            await cleanupCommand.execute({ interaction: mockInteraction as ChatInputCommandInteraction })

            expect(interactionReplyMock).toHaveBeenCalled()
        })
    })
})
