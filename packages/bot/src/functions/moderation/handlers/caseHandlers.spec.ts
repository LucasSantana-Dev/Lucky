import { describe, test, expect, jest, beforeEach } from '@jest/globals'
import {
    handleCaseView,
    handleCaseUpdate,
    handleCaseDelete,
} from './caseHandlers.js'

const getCaseMock = jest.fn()
const deactivateCaseMock = jest.fn()
const prismaUpdateMock = jest.fn()
const interactionReplyMock = jest.fn()
const infoLogMock = jest.fn()

jest.mock('@lucky/shared/services', () => ({
    moderationService: {
        getCase: (...args: unknown[]) => getCaseMock(...args),
        deactivateCase: (...args: unknown[]) => deactivateCaseMock(...args),
    },
}))

jest.mock('@lucky/shared/utils', () => ({
    getPrismaClient: () => ({
        moderationCase: {
            update: (...args: unknown[]) => prismaUpdateMock(...args),
        },
    }),
    infoLog: (...args: unknown[]) => infoLogMock(...args),
}))

jest.mock('../../../utils/general/interactionReply.js', () => ({
    interactionReply: (...args: unknown[]) => interactionReplyMock(...args),
}))

function createModerationCase(
    overrides: {
        id?: string
        caseNumber?: number
        type?: string
        username?: string
        userId?: string
        moderatorName?: string
        reason?: string | null
        active?: boolean
        appealed?: boolean
        appealReviewed?: boolean
        appealApproved?: boolean
        appealReason?: string | null
        duration?: number | null
        expiresAt?: Date | null
        createdAt?: Date
    } = {},
) {
    return {
        id: overrides.id ?? 'case-123',
        caseNumber: overrides.caseNumber ?? 1,
        type: overrides.type ?? 'warn',
        username: overrides.username ?? 'User#1234',
        userId: overrides.userId ?? 'user-123',
        moderatorName: overrides.moderatorName ?? 'Moderator#5678',
        reason: 'reason' in overrides ? overrides.reason : 'Test reason',
        active: overrides.active ?? true,
        appealed: overrides.appealed ?? false,
        appealReviewed: overrides.appealReviewed ?? false,
        appealApproved: overrides.appealApproved ?? false,
        appealReason:
            'appealReason' in overrides ? overrides.appealReason : null,
        duration: 'duration' in overrides ? overrides.duration : null,
        expiresAt: 'expiresAt' in overrides ? overrides.expiresAt : null,
        createdAt: overrides.createdAt ?? new Date('2024-01-01T00:00:00Z'),
    }
}

function createInteraction({
    guildId = 'guild-123',
    userId = 'mod-123',
    userTag = 'Moderator#5678',
    hasAdminPermission = true,
    reason = null as string | null,
} = {}) {
    const interaction = {
        guild: {
            id: guildId,
            name: 'Test Guild',
            members: {
                fetch: jest.fn(async () => ({
                    permissions: {
                        has: jest.fn(() => hasAdminPermission),
                    },
                })),
            },
        },
        user: {
            id: userId,
            tag: userTag,
        },
        options: {
            getString: jest.fn((name: string) => {
                if (name === 'reason') return reason
                return null
            }),
        },
    }

    return interaction as any
}

describe('caseHandlers', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        getCaseMock.mockResolvedValue(null)
        deactivateCaseMock.mockResolvedValue(undefined)
        prismaUpdateMock.mockResolvedValue({})
    })

    describe('handleCaseView', () => {
        test('displays case not found when case does not exist', async () => {
            const interaction = createInteraction()
            getCaseMock.mockResolvedValue(null)

            await handleCaseView(interaction, 999)

            expect(getCaseMock).toHaveBeenCalledWith('guild-123', 999)
            expect(interactionReplyMock).toHaveBeenCalledWith({
                interaction,
                content: { content: '❌ Case #999 not found.' },
            })
        })

        test('displays basic case information', async () => {
            const interaction = createInteraction()
            const moderationCase = createModerationCase({
                caseNumber: 42,
                type: 'ban',
                username: 'BadUser#1234',
                userId: 'user-456',
                moderatorName: 'GoodMod#5678',
                reason: 'Spamming',
            })
            getCaseMock.mockResolvedValue(moderationCase)

            await handleCaseView(interaction, 42)

            expect(interactionReplyMock).toHaveBeenCalledWith({
                interaction,
                content: {
                    embeds: [
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: '📋 Case #42',
                                fields: expect.arrayContaining([
                                    {
                                        name: 'Type',
                                        value: 'BAN',
                                        inline: true,
                                    },
                                    {
                                        name: 'Status',
                                        value: '🟢 Active',
                                        inline: true,
                                    },
                                    {
                                        name: 'User',
                                        value: 'BadUser#1234 (user-456)',
                                    },
                                    {
                                        name: 'Moderator',
                                        value: 'GoodMod#5678',
                                    },
                                    { name: 'Reason', value: 'Spamming' },
                                ]),
                            }),
                        }),
                    ],
                },
            })
        })

        test('displays inactive status correctly', async () => {
            const interaction = createInteraction()
            const moderationCase = createModerationCase({ active: false })
            getCaseMock.mockResolvedValue(moderationCase)

            await handleCaseView(interaction, 1)

            const embedCall = interactionReplyMock.mock.calls[0][0]
            const embed = embedCall.content.embeds[0]
            const statusField = embed.data.fields.find(
                (f: any) => f.name === 'Status',
            )
            expect(statusField.value).toBe('🔴 Inactive')
        })

        test('displays no reason provided when reason is null', async () => {
            const interaction = createInteraction()
            const moderationCase = createModerationCase({ reason: null })
            getCaseMock.mockResolvedValue(moderationCase)

            await handleCaseView(interaction, 1)

            const embedCall = interactionReplyMock.mock.calls[0][0]
            const embed = embedCall.content.embeds[0]
            const reasonField = embed.data.fields.find(
                (f: any) => f.name === 'Reason',
            )
            expect(reasonField.value).toBe('No reason provided')
        })

        test('displays duration when present', async () => {
            const interaction = createInteraction()
            const moderationCase = createModerationCase({ duration: 3600 })
            getCaseMock.mockResolvedValue(moderationCase)

            await handleCaseView(interaction, 1)

            const embedCall = interactionReplyMock.mock.calls[0][0]
            const embed = embedCall.content.embeds[0]
            const durationField = embed.data.fields.find(
                (f: any) => f.name === 'Duration',
            )
            expect(durationField).toBeDefined()
            expect(durationField.value).toBe('1 hours')
        })

        test('displays expiration date when present', async () => {
            const interaction = createInteraction()
            const expiresAt = new Date('2024-12-31T23:59:59Z')
            const moderationCase = createModerationCase({ expiresAt })
            getCaseMock.mockResolvedValue(moderationCase)

            await handleCaseView(interaction, 1)

            const embedCall = interactionReplyMock.mock.calls[0][0]
            const embed = embedCall.content.embeds[0]
            const expiresField = embed.data.fields.find(
                (f: any) => f.name === 'Expires',
            )
            expect(expiresField).toBeDefined()
        })

        test('displays appeal status when appealed but not reviewed', async () => {
            const interaction = createInteraction()
            const moderationCase = createModerationCase({
                appealed: true,
                appealReviewed: false,
                appealReason: 'I was wrongly accused',
            })
            getCaseMock.mockResolvedValue(moderationCase)

            await handleCaseView(interaction, 1)

            const embedCall = interactionReplyMock.mock.calls[0][0]
            const embed = embedCall.content.embeds[0]
            const appealStatusField = embed.data.fields.find(
                (f: any) => f.name === 'Appeal Status',
            )
            expect(appealStatusField.value).toBe('⏳ Pending')
        })

        test('displays appeal approved when reviewed and approved', async () => {
            const interaction = createInteraction()
            const moderationCase = createModerationCase({
                appealed: true,
                appealReviewed: true,
                appealApproved: true,
                appealReason: 'Misunderstanding',
            })
            getCaseMock.mockResolvedValue(moderationCase)

            await handleCaseView(interaction, 1)

            const embedCall = interactionReplyMock.mock.calls[0][0]
            const embed = embedCall.content.embeds[0]
            const appealStatusField = embed.data.fields.find(
                (f: any) => f.name === 'Appeal Status',
            )
            expect(appealStatusField.value).toBe('✅ Approved')
        })

        test('displays appeal denied when reviewed and not approved', async () => {
            const interaction = createInteraction()
            const moderationCase = createModerationCase({
                appealed: true,
                appealReviewed: true,
                appealApproved: false,
            })
            getCaseMock.mockResolvedValue(moderationCase)

            await handleCaseView(interaction, 1)

            const embedCall = interactionReplyMock.mock.calls[0][0]
            const embed = embedCall.content.embeds[0]
            const appealStatusField = embed.data.fields.find(
                (f: any) => f.name === 'Appeal Status',
            )
            expect(appealStatusField.value).toBe('❌ Denied')
        })
    })

    describe('handleCaseUpdate', () => {
        test('displays case not found when case does not exist', async () => {
            const interaction = createInteraction({ reason: 'New reason' })
            getCaseMock.mockResolvedValue(null)

            await handleCaseUpdate(interaction, 999)

            expect(interactionReplyMock).toHaveBeenCalledWith({
                interaction,
                content: { content: '❌ Case #999 not found.' },
            })
            expect(prismaUpdateMock).not.toHaveBeenCalled()
        })

        test('updates case reason successfully', async () => {
            const interaction = createInteraction({ reason: 'Updated reason' })
            const moderationCase = createModerationCase({
                id: 'case-123',
                caseNumber: 42,
                reason: 'Old reason',
            })
            getCaseMock.mockResolvedValue(moderationCase)

            await handleCaseUpdate(interaction, 42)

            expect(prismaUpdateMock).toHaveBeenCalledWith({
                where: { id: 'case-123' },
                data: { reason: 'Updated reason' },
            })
            expect(interactionReplyMock).toHaveBeenCalledWith({
                interaction,
                content: {
                    embeds: [
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: '✏️ Case #42 Updated',
                                fields: [
                                    { name: 'Old Reason', value: 'Old reason' },
                                    {
                                        name: 'New Reason',
                                        value: 'Updated reason',
                                    },
                                    {
                                        name: 'Updated By',
                                        value: 'Moderator#5678',
                                    },
                                ],
                            }),
                        }),
                    ],
                },
            })
            expect(infoLogMock).toHaveBeenCalled()
        })

        test('handles null old reason correctly', async () => {
            const interaction = createInteraction({ reason: 'Updated reason' })
            const moderationCase = createModerationCase({ reason: null })
            getCaseMock.mockResolvedValue(moderationCase)

            await handleCaseUpdate(interaction, 1)

            const embedCall = interactionReplyMock.mock.calls[0][0]
            const embed = embedCall.content.embeds[0]
            const oldReasonField = embed.data.fields.find(
                (f: any) => f.name === 'Old Reason',
            )
            expect(oldReasonField.value).toBe('No reason provided')
        })
    })

    describe('handleCaseDelete', () => {
        test('rejects delete without administrator permission', async () => {
            const interaction = createInteraction({
                hasAdminPermission: false,
            })

            await handleCaseDelete(interaction, 1)

            expect(interactionReplyMock).toHaveBeenCalledWith({
                interaction,
                content: {
                    content:
                        '❌ You need Administrator permission to delete cases.',
                },
            })
            expect(deactivateCaseMock).not.toHaveBeenCalled()
        })

        test('displays case not found when case does not exist', async () => {
            const interaction = createInteraction()
            getCaseMock.mockResolvedValue(null)

            await handleCaseDelete(interaction, 999)

            expect(interactionReplyMock).toHaveBeenCalledWith({
                interaction,
                content: { content: '❌ Case #999 not found.' },
            })
            expect(deactivateCaseMock).not.toHaveBeenCalled()
        })

        test('deletes case successfully with administrator permission', async () => {
            const interaction = createInteraction()
            const moderationCase = createModerationCase({
                id: 'case-123',
                caseNumber: 42,
                type: 'ban',
                username: 'BadUser#1234',
            })
            getCaseMock.mockResolvedValue(moderationCase)

            await handleCaseDelete(interaction, 42)

            expect(deactivateCaseMock).toHaveBeenCalledWith('case-123')
            expect(interactionReplyMock).toHaveBeenCalledWith({
                interaction,
                content: {
                    embeds: [
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: '🗑️ Case #42 Deleted',
                                fields: [
                                    { name: 'Type', value: 'BAN' },
                                    { name: 'User', value: 'BadUser#1234' },
                                    {
                                        name: 'Deleted By',
                                        value: 'Moderator#5678',
                                    },
                                ],
                            }),
                        }),
                    ],
                },
            })
            expect(infoLogMock).toHaveBeenCalled()
        })
    })
})
