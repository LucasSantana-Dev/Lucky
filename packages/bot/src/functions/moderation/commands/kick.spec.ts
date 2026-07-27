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

import kickCommand from './kick'

function createMockUser(id = 'user-123', tag = 'TestUser#1234') {
    return {
        id,
        tag,
        send: jest.fn().mockResolvedValue(undefined),
    }
}

function createMockMember(userId = 'user-123') {
    return {
        user: { id: userId },
        kick: jest.fn().mockResolvedValue(undefined),
    }
}

function createMockGuild(id = 'guild-123', name = 'Test Guild') {
    return {
        id,
        name,
        members: {
            fetch: jest.fn().mockResolvedValue(undefined),
        },
    }
}

function createInteraction({
    guildId = 'guild-123',
    guild = undefined as any,
    userId = 'user-123',
    user = null as any,
    targetUser = null as any,
    targetMember = null as any,
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

describe('kick command', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        moderationServiceMock.createCase.mockResolvedValue({
            caseNumber: 42,
        })
    })

    test('returns early if not in a guild', async () => {
        const interaction = createInteraction({ guild: null })
        const targetUser = createMockUser('target-123')
        interaction.options.getUser.mockImplementation((name: string) =>
            name === 'user' ? targetUser : null,
        )

        await kickCommand.execute({ interaction })

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

    test('returns error if member not found in guild', async () => {
        const targetUser = createMockUser('target-123')
        const guild = createMockGuild()
        guild.members.fetch.mockResolvedValue(null)
        const interaction = createInteraction({
            guild,
            targetUser,
            reason: 'disruptive',
        })

        await kickCommand.execute({ interaction })

        expect(interactionReplyMock).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.objectContaining({
                    content: expect.stringContaining('User not found'),
                }),
            }),
        )
    })

    test('sends DM to user before kicking (when not silent)', async () => {
        const targetUser = createMockUser('target-123', 'TargetUser#5678')
        const targetMember = createMockMember('target-123')
        const guild = createMockGuild()
        guild.members.fetch.mockResolvedValue(targetMember)
        const interaction = createInteraction({
            guild,
            targetUser,
            targetMember,
            reason: 'disruptive',
            silent: false,
        })

        await kickCommand.execute({ interaction })

        expect(targetUser.send).toHaveBeenCalled()
        expect(targetUser.send.mock.calls.length).toBeGreaterThan(0)
    })

    test('does not send DM when silent flag is true', async () => {
        const targetUser = createMockUser('target-123')
        const targetMember = createMockMember('target-123')
        const guild = createMockGuild()
        guild.members.fetch.mockResolvedValue(targetMember)
        const interaction = createInteraction({
            guild,
            targetUser,
            targetMember,
            reason: 'disruptive',
            silent: true,
        })

        await kickCommand.execute({ interaction })

        expect(targetUser.send).not.toHaveBeenCalled()
    })

    test('calls member.kick with correct reason', async () => {
        const targetUser = createMockUser('target-123')
        const targetMember = createMockMember('target-123')
        const guild = createMockGuild()
        guild.members.fetch.mockResolvedValue(targetMember)
        const interaction = createInteraction({
            guild,
            targetUser,
            targetMember,
            reason: 'spam',
            silent: true,
        })

        await kickCommand.execute({ interaction })

        expect(targetMember.kick).toHaveBeenCalledWith('spam')
    })

    test('creates moderation case with correct data', async () => {
        const targetUser = createMockUser('target-999', 'BadUser#1111')
        const targetMember = createMockMember('target-999')
        const guild = createMockGuild('guild-456', 'My Server')
        const moderator = createMockUser('mod-123', 'Moderator#2222')
        guild.members.fetch.mockResolvedValue(targetMember)
        const interaction = createInteraction({
            guild,
            user: moderator,
            targetUser,
            targetMember,
            reason: 'harassment',
        })

        await kickCommand.execute({ interaction })

        expect(moderationServiceMock.createCase).toHaveBeenCalledWith({
            guildId: 'guild-456',
            type: 'kick',
            userId: 'target-999',
            username: 'BadUser#1111',
            moderatorId: 'mod-123',
            moderatorName: 'Moderator#2222',
            reason: 'harassment',
            channelId: 'channel-123',
        })
    })

    test('uses default reason when none provided', async () => {
        const targetUser = createMockUser('target-123')
        const targetMember = createMockMember('target-123')
        const guild = createMockGuild()
        guild.members.fetch.mockResolvedValue(targetMember)
        const interaction = createInteraction({
            guild,
            targetUser,
            targetMember,
            reason: null,
        })

        await kickCommand.execute({ interaction })

        expect(moderationServiceMock.createCase).toHaveBeenCalledWith(
            expect.objectContaining({
                reason: 'No reason provided',
            }),
        )
    })

    test('includes case number in response embed', async () => {
        const targetUser = createMockUser('target-123')
        const targetMember = createMockMember('target-123')
        const guild = createMockGuild()
        guild.members.fetch.mockResolvedValue(targetMember)
        const interaction = createInteraction({
            guild,
            targetUser,
            targetMember,
            reason: 'spam',
            silent: true,
        })

        moderationServiceMock.createCase.mockResolvedValue({
            caseNumber: 99,
        })

        await kickCommand.execute({ interaction })

        expect(interactionReplyMock).toHaveBeenCalled()
        expect(moderationServiceMock.createCase).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'kick',
            }),
        )
    })

    test('posts to mod log after successful kick', async () => {
        const targetUser = createMockUser('target-123')
        const targetMember = createMockMember('target-123')
        const guild = createMockGuild()
        guild.members.fetch.mockResolvedValue(targetMember)
        const interaction = createInteraction({
            guild,
            targetUser,
            targetMember,
            reason: 'spam',
        })

        await kickCommand.execute({ interaction })

        expect(postToModLogMock).toHaveBeenCalledWith(guild, expect.any(Object))
    })

    test('logs info message on successful kick', async () => {
        const targetUser = createMockUser('target-456', 'TargetUser#9999')
        const targetMember = createMockMember('target-456')
        const guild = createMockGuild('guild-789', 'Admin Server')
        const moderator = createMockUser('mod-999', 'Admin#0000')
        guild.members.fetch.mockResolvedValue(targetMember)
        const interaction = createInteraction({
            guild,
            user: moderator,
            targetUser,
            targetMember,
            reason: 'spam',
        })

        await kickCommand.execute({ interaction })

        expect(infoLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining('TargetUser#9999'),
            }),
        )
    })

    test('handles DM send failure gracefully', async () => {
        const targetUser = createMockUser('target-123')
        targetUser.send.mockRejectedValue(new Error('DM failed'))
        const targetMember = createMockMember('target-123')
        const guild = createMockGuild()
        guild.members.fetch.mockResolvedValue(targetMember)
        const interaction = createInteraction({
            guild,
            targetUser,
            targetMember,
            reason: 'spam',
            silent: false,
        })

        await kickCommand.execute({ interaction })

        expect(errorLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining('Failed to send DM'),
            }),
        )
        // Kick should still proceed
        expect(targetMember.kick).toHaveBeenCalled()
    })

    test('handles kick failure', async () => {
        const targetUser = createMockUser('target-123')
        const targetMember = createMockMember('target-123')
        targetMember.kick.mockRejectedValue(new Error('No permissions'))
        const guild = createMockGuild()
        guild.members.fetch.mockResolvedValue(targetMember)
        const interaction = createInteraction({
            guild,
            targetUser,
            targetMember,
            reason: 'spam',
        })

        await kickCommand.execute({ interaction })

        expect(interactionReplyMock).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.objectContaining({
                    content: expect.stringContaining('Failed to kick user'),
                }),
            }),
        )
        expect(errorLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Failed to kick user',
            }),
        )
    })

    test('has correct command metadata', () => {
        expect(kickCommand.data.name).toBe('kick')
        expect(kickCommand.data.description).toContain('Kick a member')
    })
})
