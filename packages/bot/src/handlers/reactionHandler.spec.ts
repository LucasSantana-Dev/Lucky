// Mock the dependencies FIRST - before any imports
const mockGetSongInfoMessage = jest.fn()
const mockRecordRecommendationSkipReason = jest.fn()
const mockGetPrismaClient = jest.fn()
const mockErrorLog = jest.fn()
const mockDebugLog = jest.fn()

jest.mock('@lucky/shared/utils/database/prismaClient', () => ({
    getPrismaClient: mockGetPrismaClient,
    disconnectPrisma: jest.fn(),
}))

jest.mock('@lucky/shared/utils', () => ({
    errorLog: mockErrorLog,
    warnLog: jest.fn(),
    infoLog: jest.fn(),
    debugLog: mockDebugLog,
}))

jest.mock('@lucky/shared/services', () => ({
    starboardService: {
        getConfig: jest.fn(),
        upsertEntry: jest.fn(),
        tryClaimFirstStarDm: jest.fn(),
    },
}))

jest.mock('./player/trackNowPlaying', () => ({
    getSongInfoMessage: mockGetSongInfoMessage,
}))

jest.mock('../services/musicRecommendation/recommendationTelemetry', () => ({
    recordRecommendationSkipReason: mockRecordRecommendationSkipReason,
}))

// NOW import types and the module under test after mocks are set up
import { describe, expect, it, beforeEach } from '@jest/globals'
import type {
    MessageReaction,
    PartialMessageReaction,
    User,
    PartialUser,
    Guild,
    Message,
} from 'discord.js'
import {
    handleReactionEvents,
    handleStarboardReaction,
} from './reactionHandler'
import { starboardService } from '@lucky/shared/services'

describe('reactionHandler', () => {
    let mockClient: any
    let mockReaction: Partial<MessageReaction | PartialMessageReaction>
    let mockUser: Partial<User | PartialUser>
    let mockMessage: Partial<Message>
    let mockGuild: Partial<Guild>

    beforeEach(() => {
        jest.clearAllMocks()

        // Set up default prisma mock
        mockGetPrismaClient.mockReturnValue({
            recommendation: {
                findFirst: jest.fn(),
                update: jest.fn(),
            },
        })

        // Set up default mock guild
        mockGuild = {
            id: 'guild-123',
        }

        // Set up default mock message
        mockMessage = {
            id: 'message-456',
            guild: mockGuild as Guild,
            partial: false,
        }

        // Set up default mock user
        mockUser = {
            id: 'user-789',
            bot: false,
            partial: false,
        }

        // Set up default mock reaction
        mockReaction = {
            emoji: {
                name: '👎',
            },
            message: mockMessage as Message,
            partial: false,
            count: 1,
            fetch: jest.fn().mockResolvedValue(undefined),
        }

        // Set up default mock client
        mockClient = {
            on: jest.fn((event: string, handler: Function) => {
                // Store the handler so we can call it in tests
                if (event === 'messageReactionAdd') {
                    mockClient._messageReactionAddHandler = handler
                }
            }),
        }
    })

    describe('handleSkipReasonReaction', () => {
        it('ignores bot reactions', async () => {
            mockUser.bot = true

            handleReactionEvents(mockClient)
            await mockClient._messageReactionAddHandler(mockReaction, mockUser)

            expect(mockGetSongInfoMessage).not.toHaveBeenCalled()
        })

        it('ignores non-skip-reason emojis', async () => {
            mockReaction.emoji = { name: '❤️' }

            handleReactionEvents(mockClient)
            await mockClient._messageReactionAddHandler(mockReaction, mockUser)

            expect(mockGetSongInfoMessage).not.toHaveBeenCalled()
        })

        it('ignores reaction if message is not the now-playing message', async () => {
            mockGetSongInfoMessage.mockReturnValue({
                messageId: 'different-message-id',
                channelId: 'channel-123',
            })

            handleReactionEvents(mockClient)
            await mockClient._messageReactionAddHandler(mockReaction, mockUser)

            expect(mockRecordRecommendationSkipReason).not.toHaveBeenCalled()
        })

        it('ignores reaction if no now-playing message is registered', async () => {
            mockGetSongInfoMessage.mockReturnValue(null)

            handleReactionEvents(mockClient)
            await mockClient._messageReactionAddHandler(mockReaction, mockUser)

            expect(mockRecordRecommendationSkipReason).not.toHaveBeenCalled()
        })

        it('records generic_dislike skip reason for 👎 emoji', async () => {
            mockReaction.emoji = { name: '👎' }
            mockGetSongInfoMessage.mockReturnValue({
                messageId: 'message-456',
                channelId: 'channel-123',
            })

            const mockPrisma = {
                recommendation: {
                    findFirst: jest.fn().mockResolvedValue({
                        id: 'rec-id-123',
                    }),
                },
            }
            mockGetPrismaClient.mockReturnValue(mockPrisma)
            mockRecordRecommendationSkipReason.mockResolvedValue(undefined)

            handleReactionEvents(mockClient)
            await mockClient._messageReactionAddHandler(mockReaction, mockUser)

            expect(mockRecordRecommendationSkipReason).toHaveBeenCalledWith({
                recommendationId: 'rec-id-123',
                skipReason: 'generic_dislike',
            })
        })

        it('records too_chill skip reason for 😴 emoji', async () => {
            mockReaction.emoji = { name: '😴' }
            mockGetSongInfoMessage.mockReturnValue({
                messageId: 'message-456',
                channelId: 'channel-123',
            })

            const mockPrisma = {
                recommendation: {
                    findFirst: jest.fn().mockResolvedValue({
                        id: 'rec-id-456',
                    }),
                },
            }
            mockGetPrismaClient.mockReturnValue(mockPrisma)
            mockRecordRecommendationSkipReason.mockResolvedValue(undefined)

            handleReactionEvents(mockClient)
            await mockClient._messageReactionAddHandler(mockReaction, mockUser)

            expect(mockRecordRecommendationSkipReason).toHaveBeenCalledWith({
                recommendationId: 'rec-id-456',
                skipReason: 'too_chill',
            })
        })

        it('records mood_mismatch skip reason for 🎸 emoji', async () => {
            mockReaction.emoji = { name: '🎸' }
            mockGetSongInfoMessage.mockReturnValue({
                messageId: 'message-456',
                channelId: 'channel-123',
            })

            const mockPrisma = {
                recommendation: {
                    findFirst: jest.fn().mockResolvedValue({
                        id: 'rec-id-789',
                    }),
                },
            }
            mockGetPrismaClient.mockReturnValue(mockPrisma)
            mockRecordRecommendationSkipReason.mockResolvedValue(undefined)

            handleReactionEvents(mockClient)
            await mockClient._messageReactionAddHandler(mockReaction, mockUser)

            expect(mockRecordRecommendationSkipReason).toHaveBeenCalledWith({
                recommendationId: 'rec-id-789',
                skipReason: 'mood_mismatch',
            })
        })

        it('records repeat skip reason for 🔁 emoji', async () => {
            mockReaction.emoji = { name: '🔁' }
            mockGetSongInfoMessage.mockReturnValue({
                messageId: 'message-456',
                channelId: 'channel-123',
            })

            const mockPrisma = {
                recommendation: {
                    findFirst: jest.fn().mockResolvedValue({
                        id: 'rec-id-101',
                    }),
                },
            }
            mockGetPrismaClient.mockReturnValue(mockPrisma)
            mockRecordRecommendationSkipReason.mockResolvedValue(undefined)

            handleReactionEvents(mockClient)
            await mockClient._messageReactionAddHandler(mockReaction, mockUser)

            expect(mockRecordRecommendationSkipReason).toHaveBeenCalledWith({
                recommendationId: 'rec-id-101',
                skipReason: 'repeat',
            })
        })

        it('fetches reaction if partial', async () => {
            mockReaction.partial = true
            mockReaction.fetch = jest.fn().mockResolvedValue(undefined)
            mockGetSongInfoMessage.mockReturnValue(null)

            handleReactionEvents(mockClient)
            await mockClient._messageReactionAddHandler(mockReaction, mockUser)

            expect(mockReaction.fetch).toHaveBeenCalled()
        })

        it('handles error when finding recommendation gracefully', async () => {
            mockReaction.emoji = { name: '👎' }
            mockGetSongInfoMessage.mockReturnValue({
                messageId: 'message-456',
                channelId: 'channel-123',
            })

            const testError = new Error('Database error')
            const mockPrisma = {
                recommendation: {
                    findFirst: jest.fn().mockRejectedValue(testError),
                },
            }
            mockGetPrismaClient.mockReturnValue(mockPrisma)

            handleReactionEvents(mockClient)
            await mockClient._messageReactionAddHandler(mockReaction, mockUser)

            expect(mockErrorLog).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining(
                        'Error handling skip reason reaction',
                    ),
                }),
            )
        })

        it('does not record if no recommendation found for guild', async () => {
            mockReaction.emoji = { name: '👎' }
            mockGetSongInfoMessage.mockReturnValue({
                messageId: 'message-456',
                channelId: 'channel-123',
            })

            const mockPrisma = {
                recommendation: {
                    findFirst: jest.fn().mockResolvedValue(null),
                },
            }
            mockGetPrismaClient.mockReturnValue(mockPrisma)

            handleReactionEvents(mockClient)
            await mockClient._messageReactionAddHandler(mockReaction, mockUser)

            expect(mockRecordRecommendationSkipReason).not.toHaveBeenCalled()
        })

        it('records skip reason non-blockingly and does not break skip flow', async () => {
            mockReaction.emoji = { name: '👎' }
            mockGetSongInfoMessage.mockReturnValue({
                messageId: 'message-456',
                channelId: 'channel-123',
            })

            const mockPrisma = {
                recommendation: {
                    findFirst: jest.fn().mockResolvedValue({
                        id: 'rec-id-123',
                    }),
                },
            }
            mockGetPrismaClient.mockReturnValue(mockPrisma)

            const recordError = new Error('Persistence failed')
            mockRecordRecommendationSkipReason.mockRejectedValue(recordError)

            handleReactionEvents(mockClient)
            // Should not throw even if recordRecommendationSkipReason rejects
            await expect(
                mockClient._messageReactionAddHandler(mockReaction, mockUser),
            ).resolves.toBeUndefined()
        })

        it('logs debug message when reaction is from a bot', async () => {
            mockUser.bot = true

            handleReactionEvents(mockClient)
            await mockClient._messageReactionAddHandler(mockReaction, mockUser)

            expect(mockDebugLog).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('bot'),
                }),
            )
        })

        it('logs debug message when guild context is missing', async () => {
            mockMessage.guild = undefined

            handleReactionEvents(mockClient)
            await mockClient._messageReactionAddHandler(mockReaction, mockUser)

            expect(mockDebugLog).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('guild context missing'),
                }),
            )
        })

        it('logs debug message for non-skip-reason emoji', async () => {
            mockReaction.emoji = { name: '❤️' }

            handleReactionEvents(mockClient)
            await mockClient._messageReactionAddHandler(mockReaction, mockUser)

            expect(mockDebugLog).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('not a skip-reason emoji'),
                    data: expect.objectContaining({
                        emojiName: '❤️',
                    }),
                }),
            )
        })

        it('logs debug message when message is not the now-playing message', async () => {
            mockGetSongInfoMessage.mockReturnValue({
                messageId: 'different-message-id',
                channelId: 'channel-123',
            })

            handleReactionEvents(mockClient)
            await mockClient._messageReactionAddHandler(mockReaction, mockUser)

            expect(mockDebugLog).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining(
                        'not the now-playing message',
                    ),
                }),
            )
        })

        it('logs debug message when no recommendation is found', async () => {
            mockGetSongInfoMessage.mockReturnValue({
                messageId: 'message-456',
                channelId: 'channel-123',
                trackUrl: 'https://example.com/track',
            })

            const mockPrisma = {
                recommendation: {
                    findFirst: jest.fn().mockResolvedValue(null),
                },
            }
            mockGetPrismaClient.mockReturnValue(mockPrisma)

            handleReactionEvents(mockClient)
            await mockClient._messageReactionAddHandler(mockReaction, mockUser)

            expect(mockDebugLog).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining('no recommendation found'),
                }),
            )
        })

        it('logs debug message after successfully recording skip reason', async () => {
            mockReaction.emoji = { name: '👎' }
            mockGetSongInfoMessage.mockReturnValue({
                messageId: 'message-456',
                channelId: 'channel-123',
            })

            const mockPrisma = {
                recommendation: {
                    findFirst: jest.fn().mockResolvedValue({
                        id: 'rec-id-123',
                    }),
                },
            }
            mockGetPrismaClient.mockReturnValue(mockPrisma)
            mockRecordRecommendationSkipReason.mockResolvedValue(undefined)

            handleReactionEvents(mockClient)
            await mockClient._messageReactionAddHandler(mockReaction, mockUser)

            expect(mockDebugLog).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining(
                        'Recorded skip reason from user reaction',
                    ),
                    data: expect.objectContaining({
                        skipReason: 'generic_dislike',
                    }),
                }),
            )
        })
    })

    describe('handleStarboardReaction (seed exclusion + first-star DM)', () => {
        const config = {
            channelId: 'star-chan',
            emoji: '⭐',
            threshold: 2,
            selfStar: false,
            seedReaction: true,
            seedChannelIds: [],
            firstStarDm: true,
            firstStarDmMessage: null,
        }

        function starSetup(opts: { count: number; me: boolean }) {
            ;(starboardService.getConfig as jest.Mock).mockResolvedValue(config)
            ;(starboardService.upsertEntry as jest.Mock).mockResolvedValue({
                starboardMsgId: null,
            })
            ;(
                starboardService.tryClaimFirstStarDm as jest.Mock
            ).mockResolvedValue(true)
            const send = jest.fn().mockResolvedValue(undefined)
            const user = {
                id: 'u1',
                bot: false,
                partial: false,
                send,
            } as unknown as User
            const message = {
                id: 'm1',
                partial: false,
                guild: { id: 'g1' },
                channelId: 'chan-1',
                author: {
                    id: 'author-1',
                    username: 'author',
                    displayAvatarURL: () => 'https://cdn.x/a.png',
                },
                content: 'hello',
                url: 'https://discord.com/x',
                channel: { name: 'general' },
            }
            const reaction = {
                partial: false,
                message,
                emoji: { name: '⭐' },
                count: opts.count,
                me: opts.me,
            } as unknown as MessageReaction
            const channelSend = jest.fn().mockResolvedValue({ id: 'posted-1' })
            const client = {
                channels: {
                    fetch: jest.fn().mockResolvedValue({
                        isTextBased: () => true,
                        send: channelSend,
                        messages: { fetch: jest.fn() },
                    }),
                },
            } as any
            return { user, reaction, client, send, channelSend }
        }

        it("subtracts the bot's own seed reaction from the count", async () => {
            // 2 raw reactions but one is the bot seed -> effective 1 < threshold 2
            const { user, reaction, client, channelSend } = starSetup({
                count: 2,
                me: true,
            })
            await handleStarboardReaction(reaction, user, client)
            expect(starboardService.upsertEntry).toHaveBeenCalledWith(
                'g1',
                'm1',
                expect.objectContaining({ starCount: 1 }),
            )
            expect(channelSend).not.toHaveBeenCalled()
        })

        it('posts to the starboard when human stars alone meet the threshold', async () => {
            const { user, reaction, client, channelSend } = starSetup({
                count: 3,
                me: true,
            })
            await handleStarboardReaction(reaction, user, client)
            expect(channelSend).toHaveBeenCalledTimes(1)
        })

        it('DMs the member exactly when the claim succeeds', async () => {
            const { user, reaction, client, send } = starSetup({
                count: 1,
                me: false,
            })
            await handleStarboardReaction(reaction, user, client)
            expect(starboardService.tryClaimFirstStarDm).toHaveBeenCalledWith(
                'g1',
                'u1',
            )
            expect(send).toHaveBeenCalledTimes(1)
            expect((send.mock.calls[0] as unknown[])[0]).toContain(
                '<#star-chan>',
            )
        })

        it('does not DM when the claim reports already-sent', async () => {
            const { user, reaction, client, send } = starSetup({
                count: 1,
                me: false,
            })
            ;(
                starboardService.tryClaimFirstStarDm as jest.Mock
            ).mockResolvedValue(false)
            await handleStarboardReaction(reaction, user, client)
            expect(send).not.toHaveBeenCalled()
        })
    })
})
