import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import muteCommand from './mute.js'

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
        timeout: jest.fn(),
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
    duration = '300' as string | null,
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
                if (name === 'duration') return duration
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

describe('mute command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        createCaseMock.mockResolvedValue({
            caseNumber: 42,
            type: 'mute',
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

        await muteCommand.execute({ interaction } as any)

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

        await muteCommand.execute({ interaction } as any)

        expect(interactionReplyMock).toHaveBeenCalledWith({
            interaction,
            content: { content: '❌ User not found in this server.' },
        })
    })

    test('mutes user for 5 minutes with default reason', async () => {
        const interaction = createInteraction({ duration: '300' })
        const user = createUser()
        const member = createMember(user.id)
        interaction.options.getUser.mockReturnValue(user)
        interaction.guild.members.fetch.mockResolvedValue(member)

        await muteCommand.execute({ interaction } as any)

        expect(member.timeout).toHaveBeenCalledWith(
            300000,
            'No reason provided',
        )
        expect(createCaseMock).toHaveBeenCalledWith({
            guildId: 'guild-123',
            type: 'mute',
            userId: 'user-123',
            username: 'TestUser#1234',
            moderatorId: 'mod-123',
            moderatorName: 'Moderator#5678',
            reason: 'No reason provided',
            duration: 300,
            channelId: 'channel-123',
        })
    })

    test('mutes user for 1 day', async () => {
        const interaction = createInteraction({ duration: '86400' })
        const user = createUser()
        const member = createMember(user.id)
        interaction.options.getUser.mockReturnValue(user)
        interaction.guild.members.fetch.mockResolvedValue(member)

        await muteCommand.execute({ interaction } as any)

        expect(member.timeout).toHaveBeenCalledWith(
            86400000,
            'No reason provided',
        )
        expect(createCaseMock).toHaveBeenCalledWith(
            expect.objectContaining({
                duration: 86400,
            }),
        )
    })

    test('mutes user for 1 week', async () => {
        const interaction = createInteraction({ duration: '604800' })
        const user = createUser()
        const member = createMember(user.id)
        interaction.options.getUser.mockReturnValue(user)
        interaction.guild.members.fetch.mockResolvedValue(member)

        await muteCommand.execute({ interaction } as any)

        expect(member.timeout).toHaveBeenCalledWith(
            604800000,
            'No reason provided',
        )
    })

    test('mutes user with custom reason', async () => {
        const interaction = createInteraction({
            duration: '300',
            reason: 'Spamming',
        })
        const user = createUser()
        const member = createMember(user.id)
        interaction.options.getUser.mockReturnValue(user)
        interaction.guild.members.fetch.mockResolvedValue(member)

        await muteCommand.execute({ interaction } as any)

        expect(member.timeout).toHaveBeenCalledWith(300000, 'Spamming')
        expect(createCaseMock).toHaveBeenCalledWith(
            expect.objectContaining({
                reason: 'Spamming',
            }),
        )
    })

    test('sends DM to user when not silent', async () => {
        const interaction = createInteraction({
            duration: '3600',
            reason: 'Harassment',
        })
        const user = createUser()
        const member = createMember(user.id)
        interaction.options.getUser.mockReturnValue(user)
        interaction.guild.members.fetch.mockResolvedValue(member)

        await muteCommand.execute({ interaction } as any)

        expect(user.send).toHaveBeenCalledWith({
            embeds: [
                expect.objectContaining({
                    data: expect.objectContaining({
                        title: '🔇 You have been muted in Test Guild',
                        fields: expect.arrayContaining([
                            { name: 'Reason', value: 'Harassment' },
                        ]),
                    }),
                }),
            ],
        })
    })

    test('includes duration in DM', async () => {
        const interaction = createInteraction({
            duration: '3600',
        })
        const user = createUser()
        const member = createMember(user.id)
        interaction.options.getUser.mockReturnValue(user)
        interaction.guild.members.fetch.mockResolvedValue(member)

        await muteCommand.execute({ interaction } as any)

        const dmCall = user.send.mock.calls[0][0]
        const embed = dmCall.embeds[0]
        const durationField = embed.data.fields.find(
            (f: any) => f.name === 'Duration',
        )
        expect(durationField).toBeDefined()
        expect(durationField.value).toBe('1 hours')
    })

    test('includes case number in DM', async () => {
        const interaction = createInteraction({ duration: '300' })
        const user = createUser()
        const member = createMember(user.id)
        interaction.options.getUser.mockReturnValue(user)
        interaction.guild.members.fetch.mockResolvedValue(member)
        createCaseMock.mockResolvedValue({
            caseNumber: 55,
        })

        await muteCommand.execute({ interaction } as any)

        const dmCall = user.send.mock.calls[0][0]
        const embed = dmCall.embeds[0]
        const caseField = embed.data.fields.find(
            (f: any) => f.name === 'Case Number',
        )
        expect(caseField).toBeDefined()
        expect(caseField.value).toBe('#55')
    })

    test('skips DM when silent option is true', async () => {
        const interaction = createInteraction({ duration: '300', silent: true })
        const user = createUser()
        const member = createMember(user.id)
        interaction.options.getUser.mockReturnValue(user)
        interaction.guild.members.fetch.mockResolvedValue(member)

        await muteCommand.execute({ interaction } as any)

        expect(user.send).not.toHaveBeenCalled()
        expect(member.timeout).toHaveBeenCalled()
    })

    test('continues mute even if DM fails', async () => {
        const interaction = createInteraction({ duration: '300' })
        const user = createUser()
        user.send.mockRejectedValue(
            new Error('Cannot send messages to this user'),
        )
        const member = createMember(user.id)
        interaction.options.getUser.mockReturnValue(user)
        interaction.guild.members.fetch.mockResolvedValue(member)

        await muteCommand.execute({ interaction } as any)

        expect(errorLogMock).toHaveBeenCalledWith({
            message: 'Failed to send DM to TestUser#1234',
            error: expect.any(Error),
        })
        expect(member.timeout).toHaveBeenCalled()
        expect(createCaseMock).toHaveBeenCalled()
    })

    test('handles mute failure gracefully', async () => {
        const interaction = createInteraction({ duration: '300' })
        const user = createUser()
        const member = createMember(user.id)
        member.timeout.mockRejectedValue(new Error('Missing Permissions'))
        interaction.options.getUser.mockReturnValue(user)
        interaction.guild.members.fetch.mockResolvedValue(member)

        await muteCommand.execute({ interaction } as any)

        expect(errorLogMock).toHaveBeenCalledWith({
            message: 'Failed to mute user',
            error: expect.any(Error),
        })
        expect(interactionReplyMock).toHaveBeenCalledWith({
            interaction,
            content: {
                content:
                    '❌ Failed to mute user. Please check permissions and try again.',
            },
        })
        expect(createCaseMock).not.toHaveBeenCalled()
    })

    test('creates embed with correct case number', async () => {
        const interaction = createInteraction({ duration: '300' })
        const user = createUser()
        const member = createMember(user.id)
        interaction.options.getUser.mockReturnValue(user)
        interaction.guild.members.fetch.mockResolvedValue(member)
        createCaseMock.mockResolvedValue({
            caseNumber: 88,
        })

        await muteCommand.execute({ interaction } as any)

        expect(interactionReplyMock).toHaveBeenCalledWith({
            interaction,
            content: {
                embeds: [
                    expect.objectContaining({
                        data: expect.objectContaining({
                            title: '🔇 User Muted - Case #88',
                        }),
                    }),
                ],
            },
        })
    })

    test('includes user info in embed', async () => {
        const interaction = createInteraction({ duration: '300' })
        const user = createUser('user-456', 'TargetUser#9999')
        const member = createMember(user.id)
        interaction.options.getUser.mockReturnValue(user)
        interaction.guild.members.fetch.mockResolvedValue(member)

        await muteCommand.execute({ interaction } as any)

        const embedCall = interactionReplyMock.mock.calls[0][0]
        const embed = embedCall.content.embeds[0]
        const userField = embed.data.fields.find((f: any) => f.name === 'User')

        expect(userField).toBeDefined()
        expect(userField.value).toContain('TargetUser#9999')
        expect(userField.value).toContain('user-456')
    })

    test('includes moderator info in embed', async () => {
        const interaction = createInteraction({ duration: '300' })
        const user = createUser()
        const member = createMember(user.id)
        interaction.options.getUser.mockReturnValue(user)
        interaction.guild.members.fetch.mockResolvedValue(member)

        await muteCommand.execute({ interaction } as any)

        const embedCall = interactionReplyMock.mock.calls[0][0]
        const embed = embedCall.content.embeds[0]
        const modField = embed.data.fields.find(
            (f: any) => f.name === 'Moderator',
        )

        expect(modField).toBeDefined()
        expect(modField.value).toBe('Moderator#5678')
    })

    test('includes duration in embed', async () => {
        const interaction = createInteraction({ duration: '86400' })
        const user = createUser()
        const member = createMember(user.id)
        interaction.options.getUser.mockReturnValue(user)
        interaction.guild.members.fetch.mockResolvedValue(member)

        await muteCommand.execute({ interaction } as any)

        const embedCall = interactionReplyMock.mock.calls[0][0]
        const embed = embedCall.content.embeds[0]
        const durationField = embed.data.fields.find(
            (f: any) => f.name === 'Duration',
        )

        expect(durationField).toBeDefined()
        expect(durationField.value).toBe('1 days')
    })

    test('includes reason in embed', async () => {
        const interaction = createInteraction({
            duration: '300',
            reason: 'Disruptive behavior',
        })
        const user = createUser()
        const member = createMember(user.id)
        interaction.options.getUser.mockReturnValue(user)
        interaction.guild.members.fetch.mockResolvedValue(member)

        await muteCommand.execute({ interaction } as any)

        const embedCall = interactionReplyMock.mock.calls[0][0]
        const embed = embedCall.content.embeds[0]
        const reasonField = embed.data.fields.find(
            (f: any) => f.name === 'Reason',
        )

        expect(reasonField).toBeDefined()
        expect(reasonField.value).toBe('Disruptive behavior')
    })

    test('logs mute action with formatted duration', async () => {
        const interaction = createInteraction({ duration: '3600' })
        const user = createUser('user-789', 'BadUser#1111')
        const member = createMember(user.id)
        interaction.options.getUser.mockReturnValue(user)
        interaction.guild.members.fetch.mockResolvedValue(member)

        await muteCommand.execute({ interaction } as any)

        expect(infoLogMock).toHaveBeenCalledWith({
            message: expect.stringContaining('BadUser#1111'),
        })
        expect(infoLogMock).toHaveBeenCalledWith({
            message: expect.stringContaining('1 hours'),
        })
    })

    test('formats duration as minutes', async () => {
        const interaction = createInteraction({ duration: '60' })
        const user = createUser()
        const member = createMember(user.id)
        interaction.options.getUser.mockReturnValue(user)
        interaction.guild.members.fetch.mockResolvedValue(member)

        await muteCommand.execute({ interaction } as any)

        const embedCall = interactionReplyMock.mock.calls[0][0]
        const embed = embedCall.content.embeds[0]
        const durationField = embed.data.fields.find(
            (f: any) => f.name === 'Duration',
        )

        expect(durationField.value).toBe('1 minutes')
    })

    test('formats duration as minutes for longer durations', async () => {
        const interaction = createInteraction({ duration: '600' })
        const user = createUser()
        const member = createMember(user.id)
        interaction.options.getUser.mockReturnValue(user)
        interaction.guild.members.fetch.mockResolvedValue(member)

        await muteCommand.execute({ interaction } as any)

        const embedCall = interactionReplyMock.mock.calls[0][0]
        const embed = embedCall.content.embeds[0]
        const durationField = embed.data.fields.find(
            (f: any) => f.name === 'Duration',
        )

        expect(durationField.value).toBe('10 minutes')
    })
})
