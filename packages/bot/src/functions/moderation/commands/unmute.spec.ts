import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import unmuteCommand from './unmute.js'

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

function createMember(userId = 'user-123') {
    return {
        timeout: jest.fn().mockResolvedValue(undefined),
    } as any
}

function createGuild(id = 'guild-123', name = 'Test Guild') {
    return {
        id,
        name,
        members: {
            fetch: jest.fn(async () => createMember()),
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
                return null
            }),
        },
    }

    return interaction as any
}

describe('unmute command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        createCaseMock.mockResolvedValue({
            caseNumber: 42,
            type: 'unmute',
        })
    })

    test('rejects command outside of guild', async () => {
        const interaction = {
            guild: null,
            options: {
                getUser: jest.fn(),
                getString: jest.fn(),
            },
        } as any

        await unmuteCommand.execute({ interaction } as any)

        expect(interactionReplyMock).toHaveBeenCalledWith({
            interaction,
            content: {
                content: '❌ This command can only be used in a server.',
            },
        })
    })

    test('rejects when user not found in guild', async () => {
        const interaction = createInteraction()
        const user = createUser()
        interaction.options.getUser.mockReturnValue(user)
        interaction.guild.members.fetch.mockResolvedValue(null)

        await unmuteCommand.execute({ interaction } as any)

        expect(interactionReplyMock).toHaveBeenCalledWith({
            interaction,
            content: { content: '❌ User not found in this server.' },
        })
    })

    test('unmutes user with default reason', async () => {
        const interaction = createInteraction()
        const user = createUser()
        const member = createMember(user.id)
        interaction.options.getUser.mockReturnValue(user)
        interaction.guild.members.fetch.mockResolvedValue(member)

        await unmuteCommand.execute({ interaction } as any)

        expect(member.timeout).toHaveBeenCalledWith(null, 'No reason provided')
        expect(createCaseMock).toHaveBeenCalledWith({
            guildId: 'guild-123',
            type: 'unmute',
            userId: 'user-123',
            username: 'TestUser#1234',
            moderatorId: 'mod-123',
            moderatorName: 'Moderator#5678',
            reason: 'No reason provided',
            channelId: 'channel-123',
        })
    })

    test('unmutes user with custom reason', async () => {
        const interaction = createInteraction({ reason: 'Appeal approved' })
        const user = createUser()
        const member = createMember(user.id)
        interaction.options.getUser.mockReturnValue(user)
        interaction.guild.members.fetch.mockResolvedValue(member)

        await unmuteCommand.execute({ interaction } as any)

        expect(member.timeout).toHaveBeenCalledWith(null, 'Appeal approved')
        expect(createCaseMock).toHaveBeenCalledWith(
            expect.objectContaining({
                reason: 'Appeal approved',
            }),
        )
    })

    test('sends embed reply with case number', async () => {
        const interaction = createInteraction()
        const user = createUser()
        const member = createMember(user.id)
        interaction.options.getUser.mockReturnValue(user)
        interaction.guild.members.fetch.mockResolvedValue(member)

        await unmuteCommand.execute({ interaction } as any)

        expect(interactionReplyMock).toHaveBeenCalledWith({
            interaction,
            content: expect.objectContaining({
                embeds: expect.arrayContaining([
                    expect.objectContaining({
                        data: expect.objectContaining({
                            title: expect.stringContaining('Case #42'),
                        }),
                    }),
                ]),
            }),
        })
    })

    test('sends DM to user when unmuted', async () => {
        const interaction = createInteraction()
        const user = createUser()
        const sendMock = jest.fn().mockResolvedValue(undefined)
        user.send = sendMock
        const member = createMember(user.id)
        interaction.options.getUser.mockReturnValue(user)
        interaction.guild.members.fetch.mockResolvedValue(member)

        await unmuteCommand.execute({ interaction } as any)

        expect(sendMock).toHaveBeenCalledWith({
            embeds: expect.arrayContaining([
                expect.objectContaining({
                    data: expect.objectContaining({
                        title: expect.stringContaining('unmuted'),
                    }),
                }),
            ]),
        })
    })

    test('handles DM failure gracefully', async () => {
        const interaction = createInteraction()
        const user = createUser()
        user.send = jest.fn().mockRejectedValue(new Error('DM failed'))
        const member = createMember(user.id)
        interaction.options.getUser.mockReturnValue(user)
        interaction.guild.members.fetch.mockResolvedValue(member)

        await unmuteCommand.execute({ interaction } as any)

        expect(errorLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining('Failed to send DM'),
            }),
        )
        expect(interactionReplyMock).toHaveBeenCalled()
    })

    test('logs unmute action to info log', async () => {
        const interaction = createInteraction()
        const user = createUser()
        const member = createMember(user.id)
        interaction.options.getUser.mockReturnValue(user)
        interaction.guild.members.fetch.mockResolvedValue(member)

        await unmuteCommand.execute({ interaction } as any)

        expect(infoLogMock).toHaveBeenCalledWith({
            message: expect.stringContaining('unmuted'),
        })
    })

    test('handles member fetch error', async () => {
        const interaction = createInteraction()
        const user = createUser()
        interaction.options.getUser.mockReturnValue(user)
        interaction.guild.members.fetch.mockRejectedValue(
            new Error('fetch failed'),
        )

        await unmuteCommand.execute({ interaction } as any)

        expect(errorLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Failed to unmute user',
            }),
        )
    })

    test('handles timeout error', async () => {
        const interaction = createInteraction()
        const user = createUser()
        const member = createMember(user.id)
        member.timeout.mockRejectedValue(new Error('timeout failed'))
        interaction.options.getUser.mockReturnValue(user)
        interaction.guild.members.fetch.mockResolvedValue(member)

        await unmuteCommand.execute({ interaction } as any)

        expect(errorLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Failed to unmute user',
            }),
        )
        expect(interactionReplyMock).toHaveBeenCalledWith({
            interaction,
            content: {
                content:
                    '❌ Failed to unmute user. Please check permissions and try again.',
            },
        })
    })

    test('handles moderation service error', async () => {
        const interaction = createInteraction()
        const user = createUser()
        const member = createMember(user.id)
        interaction.options.getUser.mockReturnValue(user)
        interaction.guild.members.fetch.mockResolvedValue(member)
        createCaseMock.mockRejectedValue(new Error('db error'))

        await unmuteCommand.execute({ interaction } as any)

        expect(errorLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Failed to unmute user',
            }),
        )
    })
})
