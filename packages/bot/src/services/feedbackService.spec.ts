import { jest } from '@jest/globals'

const mockGetPrismaClient = jest.fn()
const mockCreateEmbed = jest.fn().mockReturnValue({ mocked: 'embed' })
const mockWarnLog = jest.fn()
const mockErrorLog = jest.fn()

jest.mock('@lucky/shared/utils', () => ({
    getPrismaClient: mockGetPrismaClient,
    createEmbed: mockCreateEmbed,
    warnLog: mockWarnLog,
    errorLog: mockErrorLog,
    EMBED_COLORS: { INFO: '#2196F3' },
}))

const mockCheckRateLimit = jest.fn<(...args: any[]) => any>()
jest.mock('@lucky/shared/services', () => ({
    DatabaseService: class {
        checkRateLimit = mockCheckRateLimit
    },
}))

jest.mock('@lucky/shared/constants', () => ({
    SUPPORT_SERVER_INVITE_URL: 'https://discord.gg/test-support',
}))

const mockInteractionReply = jest.fn<(...args: any[]) => any>()
jest.mock('../utils/general/interactionReply', () => ({
    interactionReply: mockInteractionReply,
}))

import { Result } from '@lucky/shared/types'
import {
    submitFeedback,
    buildFeedbackReportCustomId,
    parseFeedbackReportCustomId,
    FEEDBACK_REPORT_BUTTON_PREFIX,
} from './feedbackService'

const t = ((key: string, options?: { url?: string }) => {
    if (key === 'feedback.thankYou') return `thanks ${options?.url}`
    return key
}) as any

const mockUserFeedbackCreate = jest.fn<(...args: any[]) => any>()
const mockChannelSend = jest.fn<(...args: any[]) => any>()
const mockChannelsFetch = jest.fn<(...args: any[]) => any>()

function createMockModalSubmit(overrides: Record<string, unknown> = {}) {
    return {
        guildId: 'guild-1',
        user: { id: 'user-999' },
        guild: { memberCount: 42 },
        locale: 'en-US',
        fields: {
            getStringSelectValues: jest.fn().mockReturnValue(['bug']),
            getTextInputValue: jest.fn().mockImplementation((id: string) => {
                if (id === 'feedback_what_happened') return 'It broke'
                return ''
            }),
        },
        client: {
            channels: { fetch: mockChannelsFetch },
        },
        ...overrides,
    } as any
}

describe('feedbackService', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        mockGetPrismaClient.mockReturnValue({
            userFeedback: { create: mockUserFeedbackCreate },
        })
        mockUserFeedbackCreate.mockResolvedValue({ id: 'fb-1' })
        mockCheckRateLimit.mockResolvedValue(Result.success(true))
        mockChannelsFetch.mockResolvedValue({
            isSendable: () => true,
            send: mockChannelSend,
        })
        mockChannelSend.mockResolvedValue(undefined)
        mockInteractionReply.mockResolvedValue(undefined)
        delete process.env.FEEDBACK_CHANNEL_ID
    })

    describe('buildFeedbackReportCustomId / parseFeedbackReportCustomId', () => {
        it('round-trips a command name and sentry event id', () => {
            const customId = buildFeedbackReportCustomId('play', 'abc123')
            expect(customId.startsWith(FEEDBACK_REPORT_BUTTON_PREFIX)).toBe(
                true,
            )
            expect(parseFeedbackReportCustomId(customId)).toEqual({
                commandName: 'play',
                sentryEventId: 'abc123',
            })
        })

        it('round-trips without a sentry event id (Sentry disabled)', () => {
            const customId = buildFeedbackReportCustomId('play', undefined)
            expect(parseFeedbackReportCustomId(customId)).toEqual({
                commandName: 'play',
                sentryEventId: undefined,
            })
        })

        it('returns null for a customId with a different prefix', () => {
            expect(parseFeedbackReportCustomId('vaga_publish')).toBeNull()
        })
    })

    describe('submitFeedback', () => {
        it('happy path: persists, posts to the feedback channel, and thanks the user', async () => {
            process.env.FEEDBACK_CHANNEL_ID = 'channel-123'
            const modalSubmit = createMockModalSubmit()

            await submitFeedback(modalSubmit, {}, t)

            expect(mockUserFeedbackCreate).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    guildId: 'guild-1',
                    category: 'bug',
                    text: 'It broke',
                }),
            })
            expect(mockChannelsFetch).toHaveBeenCalledWith('channel-123')
            expect(mockChannelSend).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: [{ mocked: 'embed' }],
                    allowedMentions: { parse: [] },
                }),
            )
            expect(mockInteractionReply).toHaveBeenCalledWith({
                interaction: modalSubmit,
                content: expect.objectContaining({
                    content: 'thanks https://discord.gg/test-support',
                    ephemeral: true,
                }),
            })
        })

        it('carries command name and sentry event id from the error-button path into context', async () => {
            const modalSubmit = createMockModalSubmit()

            await submitFeedback(
                modalSubmit,
                { commandName: 'play', sentryEventId: 'sentry-evt-1' },
                t,
            )

            expect(mockUserFeedbackCreate).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    context: expect.objectContaining({
                        command: 'play',
                        sentryEventId: 'sentry-evt-1',
                    }),
                }),
            })
        })

        it('appends the optional "what did you expect" field when provided', async () => {
            const modalSubmit = createMockModalSubmit({
                fields: {
                    getStringSelectValues: jest.fn().mockReturnValue(['idea']),
                    getTextInputValue: jest
                        .fn()
                        .mockImplementation((id: string) =>
                            id === 'feedback_what_happened'
                                ? 'It broke'
                                : 'It should not break',
                        ),
                },
            })

            await submitFeedback(modalSubmit, {}, t)

            expect(mockUserFeedbackCreate).toHaveBeenCalledWith({
                data: expect.objectContaining({
                    text: 'It broke\n\nExpected: It should not break',
                    category: 'idea',
                }),
            })
        })

        it('does not persist or store any user id anywhere in the row', async () => {
            const modalSubmit = createMockModalSubmit({
                user: { id: 'user-should-never-appear' },
            })

            await submitFeedback(modalSubmit, {}, t)

            const [[createArgs]] = mockUserFeedbackCreate.mock.calls
            expect(JSON.stringify(createArgs)).not.toContain(
                'user-should-never-appear',
            )
            expect(createArgs.data).not.toHaveProperty('userId')
            expect(createArgs.data).not.toHaveProperty('discordUserId')
        })

        it('no-ops the channel post and warns when FEEDBACK_CHANNEL_ID is unset', async () => {
            const modalSubmit = createMockModalSubmit()

            await submitFeedback(modalSubmit, {}, t)

            expect(mockChannelsFetch).not.toHaveBeenCalled()
            expect(mockWarnLog).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('FEEDBACK_CHANNEL_ID'),
                }),
            )
            // Persistence and the thank-you reply still happen — a missing
            // channel must never block the rest of the pipeline.
            expect(mockUserFeedbackCreate).toHaveBeenCalled()
            expect(mockInteractionReply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.objectContaining({ ephemeral: true }),
                }),
            )
        })

        it('blocks submission and replies with the rate-limit message when over the limit', async () => {
            mockCheckRateLimit.mockResolvedValue(Result.success(false))
            const modalSubmit = createMockModalSubmit()

            await submitFeedback(modalSubmit, {}, t)

            expect(mockCheckRateLimit).toHaveBeenCalledWith(
                'feedback:user-999',
                3,
                60 * 60 * 1000,
            )
            expect(mockUserFeedbackCreate).not.toHaveBeenCalled()
            expect(mockInteractionReply).toHaveBeenCalledWith({
                interaction: modalSubmit,
                content: expect.objectContaining({
                    content: 'feedback.errors.rateLimited',
                    ephemeral: true,
                }),
            })
        })

        it('fails open (still submits) when the rate limit check itself errors', async () => {
            mockCheckRateLimit.mockResolvedValue(
                Result.failure(new Error('db down')),
            )
            const modalSubmit = createMockModalSubmit()

            await submitFeedback(modalSubmit, {}, t)

            expect(mockUserFeedbackCreate).toHaveBeenCalled()
            expect(mockErrorLog).toHaveBeenCalled()
        })

        it('replies with a guild-only error and does not persist when guildId is missing', async () => {
            const modalSubmit = createMockModalSubmit({ guildId: null })

            await submitFeedback(modalSubmit, {}, t)

            expect(mockUserFeedbackCreate).not.toHaveBeenCalled()
            expect(mockInteractionReply).toHaveBeenCalledWith({
                interaction: modalSubmit,
                content: expect.objectContaining({
                    content: 'feedback.errors.guildOnly',
                    ephemeral: true,
                }),
            })
        })
    })
})
