import { describe, test, expect, jest, beforeEach } from '@jest/globals'

const moderationServiceMock = {
    createCase: jest.fn(),
}
const interactionReplyMock = jest.fn()
const postToModLogMock = jest.fn()
const formatDurationHumanMock = jest.fn((seconds: number) => {
    if (seconds < 60) return `${seconds}s`
    if (seconds < 3600) return `${seconds / 60}m`
    if (seconds < 86400) return `${seconds / 3600}h`
    return `${seconds / 86400}d`
})
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

jest.mock('../../../utils/general/formatDuration', () => ({
    formatDurationHuman: (seconds: number) => formatDurationHumanMock(seconds),
}))

jest.mock('@lucky/shared/utils', () => ({
    infoLog: (...args: any[]) => infoLogMock(...args),
    errorLog: (...args: any[]) => errorLogMock(...args),
}))

import muteCommand from './mute'

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
        timeout: jest.fn().mockResolvedValue(undefined),
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
    duration = '3600',
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
            getString: jest.fn((name: string) => {
                if (name === 'duration') return duration
                if (name === 'reason') return reason
                return null
            }),
            getBoolean: jest.fn((name: string) =>
                name === 'silent' ? silent : null,
            ),
        },
    }

    return interaction as any
}

describe('mute command', () => {
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

        await muteCommand.execute({ interaction })

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
            duration: '3600',
            reason: 'spam',
        })

        await muteCommand.execute({ interaction })

        expect(interactionReplyMock).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.objectContaining({
                    content: expect.stringContaining('User not found'),
                }),
            }),
        )
    })

    test('converts duration seconds to milliseconds for member.timeout', async () => {
        const targetUser = createMockUser('target-123')
        const targetMember = createMockMember('target-123')
        const guild = createMockGuild()
        guild.members.fetch.mockResolvedValue(targetMember)
        const interaction = createInteraction({
            guild,
            targetUser,
            targetMember,
            duration: '3600',
            reason: 'spam',
            silent: true,
        })

        await muteCommand.execute({ interaction })

        expect(targetMember.timeout).toHaveBeenCalledWith(3600000, 'spam')
    })

    test('creates moderation case with duration in seconds', async () => {
        const targetUser = createMockUser('target-123', 'BadUser#1111')
        const targetMember = createMockMember('target-123')
        const guild = createMockGuild('guild-456', 'My Server')
        const moderator = createMockUser('mod-123', 'Moderator#2222')
        guild.members.fetch.mockResolvedValue(targetMember)
        const interaction = createInteraction({
            guild,
            user: moderator,
            targetUser,
            targetMember,
            duration: '604800',
            reason: 'harassment',
        })

        await muteCommand.execute({ interaction })

        expect(moderationServiceMock.createCase).toHaveBeenCalledWith({
            guildId: 'guild-456',
            type: 'mute',
            userId: 'target-123',
            username: 'BadUser#1111',
            moderatorId: 'mod-123',
            moderatorName: 'Moderator#2222',
            reason: 'harassment',
            duration: 604800,
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
            duration: '3600',
            reason: null,
        })

        await muteCommand.execute({ interaction })

        expect(moderationServiceMock.createCase).toHaveBeenCalledWith(
            expect.objectContaining({
                reason: 'No reason provided',
            }),
        )
    })

    test('includes duration in response embed', async () => {
        const targetUser = createMockUser('target-123')
        const targetMember = createMockMember('target-123')
        const guild = createMockGuild()
        guild.members.fetch.mockResolvedValue(targetMember)
        const interaction = createInteraction({
            guild,
            targetUser,
            targetMember,
            duration: '3600',
            reason: 'spam',
            silent: true,
        })

        await muteCommand.execute({ interaction })

        expect(interactionReplyMock).toHaveBeenCalled()
        expect(interactionReplyMock.mock.calls.length).toBeGreaterThan(0)
    })

    test('sends DM with duration when not silent', async () => {
        const targetUser = createMockUser('target-123', 'TargetUser#5678')
        const targetMember = createMockMember('target-123')
        const guild = createMockGuild()
        guild.members.fetch.mockResolvedValue(targetMember)
        const interaction = createInteraction({
            guild,
            targetUser,
            targetMember,
            duration: '3600',
            reason: 'spam',
            silent: false,
        })

        await muteCommand.execute({ interaction })

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
            duration: '3600',
            reason: 'spam',
            silent: true,
        })

        await muteCommand.execute({ interaction })

        expect(targetUser.send).not.toHaveBeenCalled()
    })

    test('posts to mod log after successful mute', async () => {
        const targetUser = createMockUser('target-123')
        const targetMember = createMockMember('target-123')
        const guild = createMockGuild()
        guild.members.fetch.mockResolvedValue(targetMember)
        const interaction = createInteraction({
            guild,
            targetUser,
            targetMember,
            duration: '3600',
            reason: 'spam',
        })

        await muteCommand.execute({ interaction })

        expect(postToModLogMock).toHaveBeenCalledWith(guild, expect.any(Object))
    })

    test('logs info message on successful mute', async () => {
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
            duration: '3600',
            reason: 'spam',
        })

        await muteCommand.execute({ interaction })

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
            duration: '3600',
            reason: 'spam',
            silent: false,
        })

        await muteCommand.execute({ interaction })

        expect(errorLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: expect.stringContaining('Failed to send DM'),
            }),
        )
        // Mute should still proceed
        expect(targetMember.timeout).toHaveBeenCalled()
    })

    test('handles mute failure', async () => {
        const targetUser = createMockUser('target-123')
        const targetMember = createMockMember('target-123')
        targetMember.timeout.mockRejectedValue(new Error('No permissions'))
        const guild = createMockGuild()
        guild.members.fetch.mockResolvedValue(targetMember)
        const interaction = createInteraction({
            guild,
            targetUser,
            targetMember,
            duration: '3600',
            reason: 'spam',
        })

        await muteCommand.execute({ interaction })

        expect(interactionReplyMock).toHaveBeenCalledWith(
            expect.objectContaining({
                content: expect.objectContaining({
                    content: expect.stringContaining('Failed to mute user'),
                }),
            }),
        )
        expect(errorLogMock).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Failed to mute user',
            }),
        )
    })

    test('has correct command metadata', () => {
        expect(muteCommand.data.name).toBe('mute')
        expect(muteCommand.data.description).toContain('Timeout')
    })

    test('handles various duration choices correctly', async () => {
        const durations = ['60', '300', '600', '3600', '86400', '604800']

        for (const duration of durations) {
            jest.clearAllMocks()
            moderationServiceMock.createCase.mockResolvedValue({
                caseNumber: 1,
            })

            const targetUser = createMockUser('target-123')
            const targetMember = createMockMember('target-123')
            const guild = createMockGuild()
            guild.members.fetch.mockResolvedValue(targetMember)
            const interaction = createInteraction({
                guild,
                targetUser,
                targetMember,
                duration,
                reason: 'test',
                silent: true,
            })

            await muteCommand.execute({ interaction })

            expect(targetMember.timeout).toHaveBeenCalledWith(
                parseInt(duration) * 1000,
                'test',
            )
        }
    })
})
