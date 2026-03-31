import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import warnCommand from './warn.js'

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

describe('warn command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        createCaseMock.mockResolvedValue({
            caseNumber: 42,
            type: 'warn',
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

        await warnCommand.execute({ interaction } as any)

        expect(interactionReplyMock).toHaveBeenCalledWith({
            interaction,
            content: {
                content: '❌ This command can only be used in a server.',
            },
        })
    })

    test('warns user with default reason', async () => {
        const interaction = createInteraction()
        const user = createUser()
        interaction.options.getUser.mockReturnValue(user)

        await warnCommand.execute({ interaction } as any)

        expect(createCaseMock).toHaveBeenCalledWith({
            guildId: 'guild-123',
            type: 'warn',
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

    test('warns user with custom reason', async () => {
        const interaction = createInteraction({ reason: 'Spamming in chat' })
        const user = createUser()
        interaction.options.getUser.mockReturnValue(user)

        await warnCommand.execute({ interaction } as any)

        expect(createCaseMock).toHaveBeenCalledWith(
            expect.objectContaining({
                reason: 'Spamming in chat',
            }),
        )
    })

    test('sends embed reply with case number', async () => {
        const interaction = createInteraction()
        const user = createUser()
        interaction.options.getUser.mockReturnValue(user)

        await warnCommand.execute({ interaction } as any)

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

    test('sends DM to user when not silent', async () => {
        const interaction = createInteraction({ silent: false })
        const user = createUser()
        const sendMock = jest.fn().mockResolvedValue(undefined)
        user.send = sendMock
        interaction.options.getUser.mockReturnValue(user)

        await warnCommand.execute({ interaction } as any)

        expect(sendMock).toHaveBeenCalledWith({
            embeds: expect.arrayContaining([
                expect.objectContaining({
                    data: expect.objectContaining({
                        title: expect.stringContaining('warned'),
                    }),
                }),
            ]),
        })
    })

    test('does not send DM when silent flag is true', async () => {
        const interaction = createInteraction({ silent: true })
        const user = createUser()
        const sendMock = jest.fn().mockResolvedValue(undefined)
        user.send = sendMock
        interaction.options.getUser.mockReturnValue(user)

        await warnCommand.execute({ interaction } as any)

        expect(sendMock).not.toHaveBeenCalled()
    })

    test('handles DM failure gracefully', async () => {
        const interaction = createInteraction({ silent: false })
        const user = createUser()
        user.send = jest.fn().mockRejectedValue(new Error('DM failed'))
        interaction.options.getUser.mockReturnValue(user)

        await warnCommand.execute({ interaction } as any)

        expect(errorLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining('Failed to send DM'),
            }),
        )
        expect(interactionReplyMock).toHaveBeenCalled()
    })

    test('handles moderation service error', async () => {
        const interaction = createInteraction()
        const user = createUser()
        interaction.options.getUser.mockReturnValue(user)
        createCaseMock.mockRejectedValue(new Error('db error'))

        await warnCommand.execute({ interaction } as any)

        expect(errorLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Failed to issue warning',
            }),
        )
        expect(interactionReplyMock).toHaveBeenCalledWith({
            interaction,
            content: {
                content: '❌ Failed to issue warning. Please try again.',
            },
        })
    })

    test('logs warning action to info log', async () => {
        const interaction = createInteraction()
        const user = createUser()
        interaction.options.getUser.mockReturnValue(user)

        await warnCommand.execute({ interaction } as any)

        expect(infoLogMock).toHaveBeenCalledWith({
            message: expect.stringContaining('Warning issued'),
        })
    })
})
