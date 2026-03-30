import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import kickCommand from './kick.js'

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
        kick: jest.fn(),
    } as any
}

function createGuild(id = 'guild-123', name = 'Test Guild') {
    return {
        id,
        name,
        members: {
            fetch: jest.fn(async () => createMember(id)),
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

describe('kick command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        createCaseMock.mockResolvedValue({
            caseNumber: 42,
            type: 'kick',
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

        await kickCommand.execute({ interaction } as any)

        expect(interactionReplyMock).toHaveBeenCalledWith({
            interaction,
            content: {
                content: '❌ This command can only be used in a server.',
            },
        })
        expect(interaction.guild).toBeNull()
    })

    test('rejects when user not found in guild', async () => {
        const interaction = createInteraction()
        const user = createUser()
        interaction.options.getUser.mockReturnValue(user)
        interaction.guild.members.fetch.mockResolvedValue(null)

        await kickCommand.execute({ interaction } as any)

        expect(interactionReplyMock).toHaveBeenCalledWith({
            interaction,
            content: { content: '❌ User not found in this server.' },
        })
    })

    test('kicks user with default reason', async () => {
        const interaction = createInteraction()
        const user = createUser()
        const member = createMember(user.id)
        interaction.options.getUser.mockReturnValue(user)
        interaction.guild.members.fetch.mockResolvedValue(member)

        await kickCommand.execute({ interaction } as any)

        expect(member.kick).toHaveBeenCalledWith('No reason provided')
        expect(createCaseMock).toHaveBeenCalledWith({
            guildId: 'guild-123',
            type: 'kick',
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

    test('kicks user with custom reason', async () => {
        const interaction = createInteraction({ reason: 'Spamming' })
        const user = createUser()
        const member = createMember(user.id)
        interaction.options.getUser.mockReturnValue(user)
        interaction.guild.members.fetch.mockResolvedValue(member)

        await kickCommand.execute({ interaction } as any)

        expect(member.kick).toHaveBeenCalledWith('Spamming')
        expect(createCaseMock).toHaveBeenCalledWith(
            expect.objectContaining({
                reason: 'Spamming',
            }),
        )
    })

    test('sends DM to user when not silent', async () => {
        const interaction = createInteraction({ reason: 'Harassment' })
        const user = createUser()
        const member = createMember(user.id)
        interaction.options.getUser.mockReturnValue(user)
        interaction.guild.members.fetch.mockResolvedValue(member)

        await kickCommand.execute({ interaction } as any)

        expect(user.send).toHaveBeenCalledWith({
            embeds: [
                expect.objectContaining({
                    data: expect.objectContaining({
                        title: '👢 You have been kicked from Test Guild',
                        fields: [{ name: 'Reason', value: 'Harassment' }],
                    }),
                }),
            ],
        })
    })

    test('skips DM when silent option is true', async () => {
        const interaction = createInteraction({ silent: true })
        const user = createUser()
        const member = createMember(user.id)
        interaction.options.getUser.mockReturnValue(user)
        interaction.guild.members.fetch.mockResolvedValue(member)

        await kickCommand.execute({ interaction } as any)

        expect(user.send).not.toHaveBeenCalled()
        expect(member.kick).toHaveBeenCalled()
    })

    test('continues kick even if DM fails', async () => {
        const interaction = createInteraction()
        const user = createUser()
        user.send.mockRejectedValue(
            new Error('Cannot send messages to this user'),
        )
        const member = createMember(user.id)
        interaction.options.getUser.mockReturnValue(user)
        interaction.guild.members.fetch.mockResolvedValue(member)

        await kickCommand.execute({ interaction } as any)

        expect(errorLogMock).toHaveBeenCalledWith({
            message: 'Failed to send DM to TestUser#1234',
            error: expect.any(Error),
        })
        expect(member.kick).toHaveBeenCalled()
        expect(createCaseMock).toHaveBeenCalled()
    })

    test('handles kick failure gracefully', async () => {
        const interaction = createInteraction()
        const user = createUser()
        const member = createMember(user.id)
        member.kick.mockRejectedValue(new Error('Missing Permissions'))
        interaction.options.getUser.mockReturnValue(user)
        interaction.guild.members.fetch.mockResolvedValue(member)

        await kickCommand.execute({ interaction } as any)

        expect(errorLogMock).toHaveBeenCalledWith({
            message: 'Failed to kick user',
            error: expect.any(Error),
        })
        expect(interactionReplyMock).toHaveBeenCalledWith({
            interaction,
            content: {
                content:
                    '❌ Failed to kick user. Please check permissions and try again.',
            },
        })
        expect(createCaseMock).not.toHaveBeenCalled()
    })

    test('creates case with correct case number in embed', async () => {
        const interaction = createInteraction()
        const user = createUser()
        const member = createMember(user.id)
        interaction.options.getUser.mockReturnValue(user)
        interaction.guild.members.fetch.mockResolvedValue(member)
        createCaseMock.mockResolvedValue({
            caseNumber: 99,
        })

        await kickCommand.execute({ interaction } as any)

        expect(interactionReplyMock).toHaveBeenCalledWith({
            interaction,
            content: {
                embeds: [
                    expect.objectContaining({
                        data: expect.objectContaining({
                            title: '👢 User Kicked - Case #99',
                        }),
                    }),
                ],
            },
        })
    })

    test('includes user information in embed', async () => {
        const interaction = createInteraction()
        const user = createUser('user-456', 'TargetUser#9999')
        const member = createMember(user.id)
        interaction.options.getUser.mockReturnValue(user)
        interaction.guild.members.fetch.mockResolvedValue(member)

        await kickCommand.execute({ interaction } as any)

        const embedCall = interactionReplyMock.mock.calls[0][0]
        const embed = embedCall.content.embeds[0]
        const userField = embed.data.fields.find((f: any) => f.name === 'User')

        expect(userField).toBeDefined()
        expect(userField.value).toContain('TargetUser#9999')
        expect(userField.value).toContain('user-456')
    })

    test('includes moderator information in embed', async () => {
        const interaction = createInteraction()
        const user = createUser()
        const member = createMember(user.id)
        interaction.options.getUser.mockReturnValue(user)
        interaction.guild.members.fetch.mockResolvedValue(member)

        await kickCommand.execute({ interaction } as any)

        const embedCall = interactionReplyMock.mock.calls[0][0]
        const embed = embedCall.content.embeds[0]
        const modField = embed.data.fields.find(
            (f: any) => f.name === 'Moderator',
        )

        expect(modField).toBeDefined()
        expect(modField.value).toBe('Moderator#5678')
    })

    test('includes reason in embed', async () => {
        const interaction = createInteraction({ reason: 'Rule violation' })
        const user = createUser()
        const member = createMember(user.id)
        interaction.options.getUser.mockReturnValue(user)
        interaction.guild.members.fetch.mockResolvedValue(member)

        await kickCommand.execute({ interaction } as any)

        const embedCall = interactionReplyMock.mock.calls[0][0]
        const embed = embedCall.content.embeds[0]
        const reasonField = embed.data.fields.find(
            (f: any) => f.name === 'Reason',
        )

        expect(reasonField).toBeDefined()
        expect(reasonField.value).toBe('Rule violation')
    })

    test('logs kick action', async () => {
        const interaction = createInteraction()
        const user = createUser('user-789', 'BadUser#1111')
        const member = createMember(user.id)
        interaction.options.getUser.mockReturnValue(user)
        interaction.guild.members.fetch.mockResolvedValue(member)

        await kickCommand.execute({ interaction } as any)

        expect(infoLogMock).toHaveBeenCalledWith({
            message: expect.stringContaining('BadUser#1111'),
        })
        expect(infoLogMock).toHaveBeenCalledWith({
            message: expect.stringContaining('Moderator#5678'),
        })
    })
})
