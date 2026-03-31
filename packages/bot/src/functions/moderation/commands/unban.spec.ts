import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import unbanCommand from './unban.js'

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

function createGuild(id = 'guild-123', name = 'Test Guild') {
    return {
        id,
        name,
        members: {
            unban: jest.fn().mockResolvedValue(undefined),
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
    userId_option = 'user-123',
    reason = null as string | null,
} = {}) {
    const interaction = {
        guild: guild || createGuild(guildId),
        guildId,
        channelId,
        user: user || { id: userId, tag: userTag },
        client: {
            users: {
                fetch: jest.fn().mockResolvedValue({
                    id: userId_option,
                    tag: 'TestUser#1234',
                }),
            },
        },
        options: {
            getString: jest.fn((name: string) => {
                if (name === 'user_id') return userId_option
                if (name === 'reason') return reason
                return null
            }),
        },
    }

    return interaction as any
}

describe('unban command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        createCaseMock.mockResolvedValue({
            caseNumber: 42,
            type: 'unban',
        })
    })

    test('rejects command outside of guild', async () => {
        const interaction = {
            guild: null,
            options: {
                getString: jest.fn(),
            },
        } as any

        await unbanCommand.execute({ interaction } as any)

        expect(interactionReplyMock).toHaveBeenCalledWith({
            interaction,
            content: {
                content: '❌ This command can only be used in a server.',
            },
        })
    })

    test('unbans user with default reason', async () => {
        const interaction = createInteraction()

        await unbanCommand.execute({ interaction } as any)

        expect(interaction.guild.members.unban).toHaveBeenCalledWith(
            'user-123',
            'No reason provided',
        )
        expect(createCaseMock).toHaveBeenCalledWith({
            guildId: 'guild-123',
            type: 'unban',
            userId: 'user-123',
            username: 'TestUser#1234',
            moderatorId: 'mod-123',
            moderatorName: 'Moderator#5678',
            reason: 'No reason provided',
            channelId: 'channel-123',
        })
    })

    test('unbans user with custom reason', async () => {
        const interaction = createInteraction({ reason: 'Appeal approved' })

        await unbanCommand.execute({ interaction } as any)

        expect(createCaseMock).toHaveBeenCalledWith(
            expect.objectContaining({
                reason: 'Appeal approved',
            }),
        )
    })

    test('sends embed reply with case number', async () => {
        const interaction = createInteraction()

        await unbanCommand.execute({ interaction } as any)

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

    test('fetches user info from API when user not cached', async () => {
        const interaction = createInteraction()

        await unbanCommand.execute({ interaction } as any)

        expect(interaction.client.users.fetch).toHaveBeenCalledWith('user-123')
    })

    test('uses user ID as username when user not found in API', async () => {
        const interaction = createInteraction()
        interaction.client.users.fetch.mockRejectedValue(
            new Error('User not found'),
        )

        await unbanCommand.execute({ interaction } as any)

        expect(createCaseMock).toHaveBeenCalledWith(
            expect.objectContaining({
                username: 'user-123',
            }),
        )
    })

    test('logs unban action to info log', async () => {
        const interaction = createInteraction()

        await unbanCommand.execute({ interaction } as any)

        expect(infoLogMock).toHaveBeenCalledWith({
            message: expect.stringContaining('unbanned'),
        })
    })

    test('handles guild unban error', async () => {
        const interaction = createInteraction()
        interaction.guild.members.unban.mockRejectedValue(
            new Error('unban failed'),
        )

        await unbanCommand.execute({ interaction } as any)

        expect(errorLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Failed to unban user',
            }),
        )
        expect(interactionReplyMock).toHaveBeenCalledWith({
            interaction,
            content: {
                content:
                    '❌ Failed to unban user. User may not be banned or ID is invalid.',
            },
        })
    })

    test('handles moderation service error after unban', async () => {
        const interaction = createInteraction()
        createCaseMock.mockRejectedValue(new Error('db error'))

        await unbanCommand.execute({ interaction } as any)

        expect(errorLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Failed to unban user',
            }),
        )
        expect(interactionReplyMock).toHaveBeenCalledWith(
            expect.objectContaining({
                interaction,
            }),
        )
    })
})
