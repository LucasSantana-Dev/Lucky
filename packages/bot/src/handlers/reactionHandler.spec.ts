// Mock the dependencies FIRST - before any imports
const mockGetSongInfoMessage = jest.fn()
const mockRecordRecommendationSkipReason = jest.fn()
const mockGetPrismaClient = jest.fn()
const mockErrorLog = jest.fn()

jest.mock('@lucky/shared/utils/database/prismaClient', () => ({
    getPrismaClient: mockGetPrismaClient,
    disconnectPrisma: jest.fn(),
}))

jest.mock('@lucky/shared/utils', () => ({
    errorLog: mockErrorLog,
    warnLog: jest.fn(),
    infoLog: jest.fn(),
    debugLog: jest.fn(),
}))

jest.mock('@lucky/shared/services', () => ({
    starboardService: {
        getConfig: jest.fn(),
        upsertEntry: jest.fn(),
    },
}))

jest.mock('./player/trackNowPlaying', () => ({
    getSongInfoMessage: mockGetSongInfoMessage,
}))

jest.mock('../services/musicRecommendation/recommendationTelemetry', () => ({
    recordRecommendationSkipReason: mockRecordRecommendationSkipReason,
}))

// NOW import types and the module under test after mocks are set up
import {
    describe,
    expect,
    it,
    beforeEach,
} from '@jest/globals'
import type {
    MessageReaction,
    PartialMessageReaction,
    User,
    PartialUser,
    Guild,
    Message,
} from 'discord.js'
import { handleReactionEvents } from './reactionHandler'

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
    })
})
