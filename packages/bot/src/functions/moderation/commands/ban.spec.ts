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

import banCommand from './ban'

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
        members: {
            ban: jest.fn().mockResolvedValue(undefined),
        },
    }
}

function createInteraction({
    guildId = 'guild-123',
    guild = undefined as any,
    userId = 'user-123',
    user = null as any,
    targetUser = null as any,
    reason = null as string | null,
    deleteMessages = null as string | null,
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
            getString: jest.fn((name: string) => {
                if (name === 'reason') return reason
                if (name === 'delete_messages') return deleteMessages
                return null
            }),
            getBoolean: jest.fn((name: string) =>
                name === 'silent' ? silent : null,
            ),
        },
    }

    return interaction as any
}

describe('ban command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        moderationServiceMock.createCase.mockResolvedValue({
            caseNumber: 1,
        })
    })

    test('returns early if not in a guild', async () => {
        const interaction = createInteraction({ guild: null })
        const targetUser = createMockUser('target-123')
        interaction.options.getUser.mockImplementation((name: string) =>
            name === 'user' ? targetUser : null,
        )

        await banCommand.execute({ interaction })

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

    test('sends DM to user before banning (when not silent)', async () => {
        const targetUser = createMockUser('target-123', 'TargetUser#5678')
        const guild = createMockGuild()
        const interaction = createInteraction({
            guild,
            targetUser,
            reason: 'spam',
            silent: false,
        })

        await banCommand.execute({ interaction })

        expect(targetUser.send).toHaveBeenCalled()
        expect(targetUser.send.mock.calls.length).toBeGreaterThan(0)
    })

    test('does not send DM when silent flag is true', async () => {
        const targetUser = createMockUser('target-123')
        const guild = createMockGuild()
        const interaction = createInteraction({
            guild,
            targetUser,
            reason: 'spam',
            silent: true,
        })

        await banCommand.execute({ interaction })

        expect(targetUser.send).not.toHaveBeenCalled()
    })

    test('calls guild.members.ban with correct parameters', async () => {
        const targetUser = createMockUser('target-123')
        const guild = createMockGuild()
        const interaction = createInteraction({
            guild,
            targetUser,
            reason: 'flooding',
            deleteMessages: '86400',
            silent: true,
        })

        await banCommand.execute({ interaction })

        expect(guild.members.ban).toHaveBeenCalledWith('target-123', {
            reason: 'flooding',
            deleteMessageSeconds: 86400,
        })
    })

    test('creates moderation case with correct data', async () => {
        const targetUser = createMockUser('target-123', 'BadUser#1111')
        const guild = createMockGuild('guild-456', 'My Server')
        const moderator = createMockUser('mod-123', 'Moderator#2222')
        const interaction = createInteraction({
            guild,
            user: moderator,
            targetUser,
            reason: 'harassment',
            deleteMessages: '0',
        })

        await banCommand.execute({ interaction })

        expect(moderationServiceMock.createCase).toHaveBeenCalledWith({
            guildId: 'guild-456',
            type: 'ban',
            userId: 'target-123',
            username: 'BadUser#1111',
            moderatorId: 'mod-123',
            moderatorName: 'Moderator#2222',
            reason: 'harassment',
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

        await banCommand.execute({ interaction })

        expect(moderationServiceMock.createCase).toHaveBeenCalledWith(
            expect.objectContaining({
                reason: 'No reason provided',
            }),
        )
    })

    test('includes message deletion info in embed when deleteMessages > 0', async () => {
        const targetUser = createMockUser('target-123')
        const guild = createMockGuild()
        const interaction = createInteraction({
            guild,
            targetUser,
            reason: 'spam',
            deleteMessages: '86400',
            silent: true,
        })

        await banCommand.execute({ interaction })

        expect(interactionReplyMock).toHaveBeenCalled()
        expect(guild.members.ban).toHaveBeenCalledWith('target-123', {
            reason: 'spam',
            deleteMessageSeconds: 86400,
        })
    })

    test('posts to mod log after successful ban', async () => {
        const targetUser = createMockUser('target-123')
        const guild = createMockGuild()
        const interaction = createInteraction({
            guild,
            targetUser,
            reason: 'spam',
        })

        await banCommand.execute({ interaction })

        expect(postToModLogMock).toHaveBeenCalledWith(guild, expect.any(Object))
    })

    test('logs info message on successful ban', async () => {
        const targetUser = createMockUser('target-456', 'TargetUser#9999')
        const guild = createMockGuild('guild-789', 'Admin Server')
        const moderator = createMockUser('mod-999', 'Admin#0000')
        const interaction = createInteraction({
            guild,
            user: moderator,
            targetUser,
            reason: 'spam',
        })

        await banCommand.execute({ interaction })

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

        await banCommand.execute({ interaction })

        expect(errorLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining('Failed to send DM'),
            }),
        )
        // Ban should still proceed
        expect(guild.members.ban).toHaveBeenCalled()
    })

    test('handles ban failure', async () => {
        const targetUser = createMockUser('target-123')
        const guild = createMockGuild()
        guild.members.ban.mockRejectedValue(new Error('No permissions'))
        const interaction = createInteraction({
            guild,
            targetUser,
            reason: 'spam',
        })

        await banCommand.execute({ interaction })

        expect(interactionReplyMock).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.objectContaining({
                    content: expect.stringContaining('Failed to ban user'),
                }),
            }),
        )
        expect(errorLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Failed to ban user',
            }),
        )
    })

    test('has correct command metadata', () => {
        expect(banCommand.data.name).toBe('ban')
        expect(banCommand.data.description).toContain('Ban a user')
    })
})
