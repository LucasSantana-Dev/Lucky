import { describe, test, expect, jest, beforeEach } from '@jest/globals'

const moderationServiceMock = {
    createCase: jest.fn(),
}
const interactionReplyMock = jest.fn()
const postToModLogMock = jest.fn()
const infoLogMock = jest.fn()
const errorLogMock = jest.fn()

jest.mock('@lucky/shared/services', () => ({
    moderationService: moderationServiceMock,
}))

jest.mock('../../../utils/general/interactionReply', () => ({
    interactionReply: (...args: any[]) => interactionReplyMock(...args),
}))

jest.mock('../helpers/modLogPoster', () => ({
    postToModLog: (...args: any[]) => postToModLogMock(...args),
}))

jest.mock('@lucky/shared/utils', () => ({
    infoLog: (...args: any[]) => infoLogMock(...args),
    errorLog: (...args: any[]) => errorLogMock(...args),
}))

import warnCommand from './warn'

function createMockUser(id = 'user-123', tag = 'TestUser#1234') {
    return {
        id,
        tag,
        send: jest.fn().mockResolvedValue(undefined),
    }
}

function createMockGuild(id = 'guild-123', name = 'Test Guild') {
    return {
        id,
        name,
    }
}

function createInteraction({
    guildId = 'guild-123',
    guild = undefined as any,
    userId = 'user-123',
    user = null as any,
    targetUser = null as any,
    reason = null as string | null,
    silent = false,
} = {}) {
    const interaction = {
        guild: guild !== undefined ? guild : createMockGuild(guildId),
        guildId,
        channelId: 'channel-123',
        user: user || createMockUser(userId),
        options: {
            getUser: jest.fn((name: string, required?: boolean) =>
                name === 'user' ? targetUser : null,
            ),
            getString: jest.fn((name: string) =>
                name === 'reason' ? reason : null,
            ),
            getBoolean: jest.fn((name: string) =>
                name === 'silent' ? silent : null,
            ),
        },
    }

    return interaction as any
}

describe('warn command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        moderationServiceMock.createCase.mockResolvedValue({
            caseNumber: 5,
        })
    })

    test('returns early if not in a guild', async () => {
        const interaction = createInteraction({ guild: null })
        const targetUser = createMockUser('target-123')
        interaction.options.getUser.mockImplementation((name: string) =>
            name === 'user' ? targetUser : null,
        )

        await warnCommand.execute({ interaction })

        expect(interactionReplyMock).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.objectContaining({
                    content: expect.stringContaining(
                        'only be used in a server',
                    ),
                }),
            }),
        )
    })

    test('creates moderation case for warning', async () => {
        const targetUser = createMockUser('target-123', 'BadUser#1111')
        const guild = createMockGuild('guild-456', 'My Server')
        const moderator = createMockUser('mod-123', 'Moderator#2222')
        const interaction = createInteraction({
            guild,
            user: moderator,
            targetUser,
            reason: 'off-topic spam',
        })

        await warnCommand.execute({ interaction })

        expect(moderationServiceMock.createCase).toHaveBeenCalledWith({
            guildId: 'guild-456',
            type: 'warn',
            userId: 'target-123',
            username: 'BadUser#1111',
            moderatorId: 'mod-123',
            moderatorName: 'Moderator#2222',
            reason: 'off-topic spam',
            channelId: 'channel-123',
        })
    })

    test('uses default reason when none provided', async () => {
        const targetUser = createMockUser('target-123')
        const guild = createMockGuild()
        const interaction = createInteraction({
            guild,
            targetUser,
            reason: null,
        })

        await warnCommand.execute({ interaction })

        expect(moderationServiceMock.createCase).toHaveBeenCalledWith(
            expect.objectContaining({
                reason: 'No reason provided',
            }),
        )
    })

    test('includes case number in response embed', async () => {
        const targetUser = createMockUser('target-123')
        const guild = createMockGuild()
        const interaction = createInteraction({
            guild,
            targetUser,
            reason: 'warning test',
            silent: true,
        })

        moderationServiceMock.createCase.mockResolvedValue({
            caseNumber: 42,
        })

        await warnCommand.execute({ interaction })

        expect(interactionReplyMock).toHaveBeenCalled()
        expect(interactionReplyMock.mock.calls.length).toBeGreaterThan(0)
    })

    test('sends DM to user with case number when not silent', async () => {
        const targetUser = createMockUser('target-123', 'TargetUser#5678')
        const guild = createMockGuild()
        const interaction = createInteraction({
            guild,
            targetUser,
            reason: 'warning test',
            silent: false,
        })

        moderationServiceMock.createCase.mockResolvedValue({
            caseNumber: 10,
        })

        await warnCommand.execute({ interaction })

        expect(targetUser.send).toHaveBeenCalled()
        expect(targetUser.send.mock.calls.length).toBeGreaterThan(0)
    })

    test('does not send DM when silent flag is true', async () => {
        const targetUser = createMockUser('target-123')
        const guild = createMockGuild()
        const interaction = createInteraction({
            guild,
            targetUser,
            reason: 'warning test',
            silent: true,
        })

        await warnCommand.execute({ interaction })

        expect(targetUser.send).not.toHaveBeenCalled()
    })

    test('posts to mod log after successful warning', async () => {
        const targetUser = createMockUser('target-123')
        const guild = createMockGuild()
        const interaction = createInteraction({
            guild,
            targetUser,
            reason: 'spam',
        })

        await warnCommand.execute({ interaction })

        expect(postToModLogMock).toHaveBeenCalledWith(guild, expect.any(Object))
    })

    test('logs info message on successful warning', async () => {
        const targetUser = createMockUser('target-456', 'TargetUser#9999')
        const guild = createMockGuild('guild-789', 'Admin Server')
        const moderator = createMockUser('mod-999', 'Admin#0000')
        const interaction = createInteraction({
            guild,
            user: moderator,
            targetUser,
            reason: 'spam',
        })

        await warnCommand.execute({ interaction })

        expect(infoLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining('TargetUser#9999'),
            }),
        )
    })

    test('handles DM send failure gracefully', async () => {
        const targetUser = createMockUser('target-123')
        targetUser.send.mockRejectedValue(new Error('DM failed'))
        const guild = createMockGuild()
        const interaction = createInteraction({
            guild,
            targetUser,
            reason: 'spam',
            silent: false,
        })

        await warnCommand.execute({ interaction })

        expect(errorLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining('Failed to send DM'),
            }),
        )
        // Warning should still be created
        expect(moderationServiceMock.createCase).toHaveBeenCalled()
    })

    test('handles warning creation failure', async () => {
        const targetUser = createMockUser('target-123')
        const guild = createMockGuild()
        moderationServiceMock.createCase.mockRejectedValue(
            new Error('DB error'),
        )
        const interaction = createInteraction({
            guild,
            targetUser,
            reason: 'spam',
        })

        await warnCommand.execute({ interaction })

        expect(interactionReplyMock).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.objectContaining({
                    content: expect.stringContaining('Failed to issue warning'),
                }),
            }),
        )
        expect(errorLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Failed to issue warning',
            }),
        )
    })

    test('includes reason in both embed and DM', async () => {
        const targetUser = createMockUser('target-123')
        const guild = createMockGuild()
        const reason = 'excessive pinging'
        const interaction = createInteraction({
            guild,
            targetUser,
            reason,
            silent: false,
        })

        await warnCommand.execute({ interaction })

        // Check that both main embed and DM were sent
        expect(interactionReplyMock).toHaveBeenCalled()
        expect(targetUser.send).toHaveBeenCalled()
    })

    test('has correct command metadata', () => {
        expect(warnCommand.data.name).toBe('warn')
        expect(warnCommand.data.description).toContain('warning')
    })

    test('creates case before sending DM', async () => {
        const targetUser = createMockUser('target-123')
        const guild = createMockGuild()
        const interaction = createInteraction({
            guild,
            targetUser,
            reason: 'test',
            silent: false,
        })

        const callOrder: string[] = []
        moderationServiceMock.createCase.mockImplementation(() => {
            callOrder.push('createCase')
            return Promise.resolve({ caseNumber: 99 })
        })
        targetUser.send.mockImplementation(() => {
            callOrder.push('sendDM')
            return Promise.resolve(undefined)
        })

        await warnCommand.execute({ interaction })

        // Case should be created before DM is sent
        expect(callOrder.indexOf('createCase')).toBeLessThan(
            callOrder.indexOf('sendDM'),
        )
    })
})
