import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import lockdownCommand from './lockdown.js'
import { ChannelType, PermissionFlagsBits } from 'discord.js'

const interactionReplyMock = jest.fn()
const infoLogMock = jest.fn()
const errorLogMock = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    infoLog: (...args: unknown[]) => infoLogMock(...args),
    errorLog: (...args: unknown[]) => errorLogMock(...args),
}))

jest.mock('../../../utils/general/interactionReply.js', () => ({
    interactionReply: (...args: unknown[]) => interactionReplyMock(...args),
}))

function createPermissionOverwrite(sendMessagesDenied = false) {
    return {
        deny: {
            has: jest.fn((perm) => {
                if (perm === PermissionFlagsBits.SendMessages) {
                    return sendMessagesDenied
                }
                return false
            }),
        },
    } as any
}

function createChannel(id = 'channel-123', name = 'general') {
    return {
        id,
        name,
        type: ChannelType.GuildText,
        toString: jest.fn(() => `<#${id}>`),
        permissionOverwrites: {
            cache: new Map(),
            edit: jest.fn(async () => null),
        },
    } as any
}

function createGuild(id = 'guild-123', name = 'Test Guild') {
    return {
        id,
        name,
        roles: {
            everyone: {
                id: 'role-everyone',
            },
        },
    } as any
}

function createInteraction({
    guildId = 'guild-123',
    guild = null as any,
    channelId = 'channel-123',
    channel = null as any,
    userId = 'mod-123',
    userTag = 'Moderator#5678',
    selectedChannel = null as any,
    reason = null as string | null,
} = {}) {
    const interaction = {
        guild: guild || createGuild(guildId),
        guildId,
        channel: channel || createChannel(channelId),
        channelId,
        user: { id: userId, tag: userTag },
        options: {
            getChannel: jest.fn((name: string) => {
                if (name === 'channel') return selectedChannel
                return null
            }),
            getString: jest.fn((name: string) => {
                if (name === 'reason') return reason
                return null
            }),
        },
    }

    return interaction as any
}

describe('lockdown command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    test('rejects command outside of guild', async () => {
        const interaction = {
            guild: null,
            channel: createChannel(),
            options: {
                getChannel: jest.fn(),
                getString: jest.fn(),
            },
        } as any

        await lockdownCommand.execute({ interaction } as any)

        expect(interactionReplyMock).toHaveBeenCalledWith({
            interaction,
            content: {
                content: '❌ This command can only be used in a server.',
            },
        })
    })

    test('locks unlocked channel', async () => {
        const interaction = createInteraction()
        const channel = createChannel()
        interaction.channel = channel
        interaction.guild.roles.everyone.id = 'role-everyone'

        await lockdownCommand.execute({ interaction } as any)

        expect(channel.permissionOverwrites.edit).toHaveBeenCalledWith(
            interaction.guild.roles.everyone,
            { SendMessages: false },
        )
    })

    test('unlocks locked channel', async () => {
        const interaction = createInteraction()
        const channel = createChannel()
        const overwrite = createPermissionOverwrite(true)
        channel.permissionOverwrites.cache.set('role-everyone', overwrite)
        interaction.channel = channel
        interaction.guild.roles.everyone.id = 'role-everyone'

        await lockdownCommand.execute({ interaction } as any)

        expect(channel.permissionOverwrites.edit).toHaveBeenCalledWith(
            interaction.guild.roles.everyone,
            { SendMessages: null },
        )
    })

    test('shows lock embed when locking', async () => {
        const interaction = createInteraction()
        const channel = createChannel('channel-123', 'general')
        interaction.channel = channel
        interaction.guild.roles.everyone.id = 'role-everyone'

        await lockdownCommand.execute({ interaction } as any)

        expect(interactionReplyMock).toHaveBeenCalledWith({
            interaction,
            content: {
                embeds: [
                    expect.objectContaining({
                        data: expect.objectContaining({
                            title: '🔒 Channel Locked',
                            color: 0xf44336,
                        }),
                    }),
                ],
            },
        })
    })

    test('shows unlock embed when unlocking', async () => {
        const interaction = createInteraction()
        const channel = createChannel('channel-123', 'general')
        const overwrite = createPermissionOverwrite(true)
        channel.permissionOverwrites.cache.set('role-everyone', overwrite)
        interaction.channel = channel
        interaction.guild.roles.everyone.id = 'role-everyone'

        await lockdownCommand.execute({ interaction } as any)

        expect(interactionReplyMock).toHaveBeenCalledWith({
            interaction,
            content: {
                embeds: [
                    expect.objectContaining({
                        data: expect.objectContaining({
                            title: '🔓 Channel Unlocked',
                            color: 0x4caf50,
                        }),
                    }),
                ],
            },
        })
    })

    test('includes channel info in embed', async () => {
        const interaction = createInteraction()
        const channel = createChannel('channel-123', 'general')
        interaction.channel = channel

        await lockdownCommand.execute({ interaction } as any)

        const embedCall = interactionReplyMock.mock.calls[0][0]
        const embed = embedCall.content.embeds[0]
        const channelField = embed.data.fields.find(
            (f: any) => f.name === 'Channel',
        )

        expect(channelField).toBeDefined()
    })

    test('includes reason in embed when provided', async () => {
        const interaction = createInteraction({ reason: 'Spam attack' })
        const channel = createChannel()
        interaction.channel = channel

        await lockdownCommand.execute({ interaction } as any)

        const embedCall = interactionReplyMock.mock.calls[0][0]
        const embed = embedCall.content.embeds[0]
        const reasonField = embed.data.fields.find(
            (f: any) => f.name === 'Reason',
        )

        expect(reasonField).toBeDefined()
        expect(reasonField.value).toBe('Spam attack')
    })

    test('includes moderator info in embed', async () => {
        const interaction = createInteraction()
        const channel = createChannel()
        interaction.channel = channel

        await lockdownCommand.execute({ interaction } as any)

        const embedCall = interactionReplyMock.mock.calls[0][0]
        const embed = embedCall.content.embeds[0]
        const modField = embed.data.fields.find(
            (f: any) => f.name === 'Moderator',
        )

        expect(modField).toBeDefined()
        expect(modField.value).toBe('Moderator#5678')
    })

    test('uses selected channel when provided', async () => {
        const interaction = createInteraction()
        const selectedChannel = createChannel('channel-456', 'announcements')
        interaction.options.getChannel.mockReturnValue(selectedChannel)
        interaction.guild.roles.everyone.id = 'role-everyone'

        await lockdownCommand.execute({ interaction } as any)

        expect(selectedChannel.permissionOverwrites.edit).toHaveBeenCalled()
    })

    test('logs lock action', async () => {
        const interaction = createInteraction()
        const channel = createChannel('channel-123', 'general')
        interaction.channel = channel

        await lockdownCommand.execute({ interaction } as any)

        expect(infoLogMock).toHaveBeenCalledWith({
            message: expect.stringContaining('locked'),
        })
        expect(infoLogMock).toHaveBeenCalledWith({
            message: expect.stringContaining('Moderator#5678'),
        })
    })

    test('logs unlock action', async () => {
        const interaction = createInteraction()
        const channel = createChannel('channel-123', 'general')
        const overwrite = createPermissionOverwrite(true)
        channel.permissionOverwrites.cache.set('role-everyone', overwrite)
        interaction.channel = channel
        interaction.guild.roles.everyone.id = 'role-everyone'

        await lockdownCommand.execute({ interaction } as any)

        expect(infoLogMock).toHaveBeenCalledWith({
            message: expect.stringContaining('unlocked'),
        })
    })

    test('handles lockdown failure gracefully', async () => {
        const interaction = createInteraction()
        const channel = createChannel()
        channel.permissionOverwrites.edit.mockRejectedValue(
            new Error('Missing permissions'),
        )
        interaction.channel = channel

        await lockdownCommand.execute({ interaction } as any)

        expect(errorLogMock).toHaveBeenCalledWith({
            message: 'Failed to toggle channel lockdown',
            error: expect.any(Error),
        })
        expect(interactionReplyMock).toHaveBeenCalledWith({
            interaction,
            content: {
                content:
                    '❌ Failed to toggle lockdown. Please check permissions and try again.',
            },
        })
    })
})
