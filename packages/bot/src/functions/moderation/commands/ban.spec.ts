import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import banCommand from './ban.js'

const createCaseMock = jest.fn()
const interactionReplyMock = jest.fn()
const infoLogMock = jest.fn()
const errorLogMock = jest.fn()

jest.mock('@lucky/shared/services', () => ({
    moderationService: {
        createCase: (...args: unknown[]) => createCaseMock(...args),
    },
}))

jest.mock('@lucky/shared/utils', () => ({
    infoLog: (...args: unknown[]) => infoLogMock(...args),
    errorLog: (...args: unknown[]) => errorLogMock(...args),
}))

jest.mock('../../../utils/general/interactionReply.js', () => ({
    interactionReply: (...args: unknown[]) => interactionReplyMock(...args),
}))

function createUser(id = 'user-123', tag = 'TestUser#1234') {
    return {
        id,
        tag,
        send: jest.fn(),
    } as any
}

function createGuild(id = 'guild-123', name = 'Test Guild') {
    return {
        id,
        name,
        members: {
            ban: jest.fn(),
        },
    } as any
}

function createInteraction({
    guildId = 'guild-123',
    guild = null as any,
    userId = 'mod-123',
    userTag = 'Moderator#5678',
    channelId = 'channel-123',
    user = null as any,
    reason = null as string | null,
    deleteMessages = null as string | null,
    silent = null as boolean | null,
} = {}) {
    const interaction = {
        guild: guild || createGuild(guildId),
        guildId,
        channelId,
        user: user || { id: userId, tag: userTag },
        options: {
            getUser: jest.fn((name: string, required?: boolean) => {
                if (name === 'user') return createUser()
                return null
            }),
            getString: jest.fn((name: string) => {
                if (name === 'reason') return reason
                if (name === 'delete_messages') return deleteMessages
                return null
            }),
            getBoolean: jest.fn((name: string) => {
                if (name === 'silent') return silent
                return null
            }),
        },
    }

    return interaction as any
}

describe('ban command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        createCaseMock.mockResolvedValue({
            caseNumber: 42,
            type: 'ban',
        })
    })

    test('rejects command outside of guild', async () => {
        const interaction = {
            guild: null,
            options: {
                getUser: jest.fn(),
                getString: jest.fn(),
                getBoolean: jest.fn(),
            },
        } as any

        await banCommand.execute({ interaction } as any)

        expect(interactionReplyMock).toHaveBeenCalledWith({
            interaction,
            content: {
                content: '❌ This command can only be used in a server.',
            },
        })
        expect(interaction.guild).toBeNull()
    })

    test('bans user with default reason and no message deletion', async () => {
        const interaction = createInteraction()
        const user = createUser()
        interaction.options.getUser.mockReturnValue(user)

        await banCommand.execute({ interaction } as any)

        expect(interaction.guild.members.ban).toHaveBeenCalledWith('user-123', {
            reason: 'No reason provided',
            deleteMessageSeconds: 0,
        })
        expect(createCaseMock).toHaveBeenCalledWith({
            guildId: 'guild-123',
            type: 'ban',
            userId: 'user-123',
            username: 'TestUser#1234',
            moderatorId: 'mod-123',
            moderatorName: 'Moderator#5678',
            reason: 'No reason provided',
            channelId: 'channel-123',
        })
        expect(infoLogMock).toHaveBeenCalled()
        expect(interactionReplyMock).toHaveBeenCalled()
    })

    test('bans user with custom reason', async () => {
        const interaction = createInteraction({ reason: 'Spamming' })
        const user = createUser()
        interaction.options.getUser.mockReturnValue(user)

        await banCommand.execute({ interaction } as any)

        expect(interaction.guild.members.ban).toHaveBeenCalledWith('user-123', {
            reason: 'Spamming',
            deleteMessageSeconds: 0,
        })
        expect(createCaseMock).toHaveBeenCalledWith(
            expect.objectContaining({
                reason: 'Spamming',
            }),
        )
    })

    test('bans user and deletes 24 hours of messages', async () => {
        const interaction = createInteraction({ deleteMessages: '86400' })
        const user = createUser()
        interaction.options.getUser.mockReturnValue(user)

        await banCommand.execute({ interaction } as any)

        expect(interaction.guild.members.ban).toHaveBeenCalledWith('user-123', {
            reason: 'No reason provided',
            deleteMessageSeconds: 86400,
        })
        expect(interactionReplyMock).toHaveBeenCalled()
    })

    test('sends DM to user when not silent', async () => {
        const interaction = createInteraction({ reason: 'Harassment' })
        const user = createUser()
        interaction.options.getUser.mockReturnValue(user)

        await banCommand.execute({ interaction } as any)

        expect(user.send).toHaveBeenCalledWith({
            embeds: [
                expect.objectContaining({
                    data: expect.objectContaining({
                        title: '🔨 You have been banned from Test Guild',
                        fields: [{ name: 'Reason', value: 'Harassment' }],
                    }),
                }),
            ],
        })
    })

    test('skips DM when silent option is true', async () => {
        const interaction = createInteraction({ silent: true })
        const user = createUser()
        interaction.options.getUser.mockReturnValue(user)

        await banCommand.execute({ interaction } as any)

        expect(user.send).not.toHaveBeenCalled()
        expect(interaction.guild.members.ban).toHaveBeenCalled()
    })

    test('continues ban even if DM fails', async () => {
        const interaction = createInteraction()
        const user = createUser()
        user.send.mockRejectedValue(
            new Error('Cannot send messages to this user'),
        )
        interaction.options.getUser.mockReturnValue(user)

        await banCommand.execute({ interaction } as any)

        expect(errorLogMock).toHaveBeenCalledWith({
            message: 'Failed to send DM to TestUser#1234',
            error: expect.any(Error),
        })
        expect(interaction.guild.members.ban).toHaveBeenCalled()
    })

    test('handles ban failure gracefully', async () => {
        const interaction = createInteraction()
        const user = createUser()
        interaction.options.getUser.mockReturnValue(user)
        interaction.guild.members.ban.mockRejectedValue(
            new Error('Missing Permissions'),
        )

        await banCommand.execute({ interaction } as any)

        expect(errorLogMock).toHaveBeenCalledWith({
            message: 'Failed to ban user',
            error: expect.any(Error),
        })
        expect(interactionReplyMock).toHaveBeenCalledWith({
            interaction,
            content: {
                content:
                    '❌ Failed to ban user. Please check permissions and try again.',
            },
        })
        expect(createCaseMock).not.toHaveBeenCalled()
    })

    test('creates case with correct case number in embed', async () => {
        const interaction = createInteraction()
        const user = createUser()
        interaction.options.getUser.mockReturnValue(user)
        createCaseMock.mockResolvedValue({
            caseNumber: 123,
        })

        await banCommand.execute({ interaction } as any)

        expect(interactionReplyMock).toHaveBeenCalledWith({
            interaction,
            content: {
                embeds: [
                    expect.objectContaining({
                        data: expect.objectContaining({
                            title: '🔨 User Banned - Case #123',
                        }),
                    }),
                ],
            },
        })
    })

    test('includes message deletion in embed when messages deleted', async () => {
        const interaction = createInteraction({ deleteMessages: '604800' })
        const user = createUser()
        interaction.options.getUser.mockReturnValue(user)

        await banCommand.execute({ interaction } as any)

        const embedCall = interactionReplyMock.mock.calls[0][0]
        const embed = embedCall.content.embeds[0]
        const messageField = embed.data.fields.find(
            (f: any) => f.name === 'Messages Deleted',
        )

        expect(messageField).toBeDefined()
        expect(messageField.value).toContain('7 days')
    })
})
