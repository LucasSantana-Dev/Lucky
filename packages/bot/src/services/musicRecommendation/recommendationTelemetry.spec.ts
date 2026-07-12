import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import { RecommendationSource as PrismaRecommendationSource } from '@lucky/shared/types'

// Mock functions defined first (before jest.mock calls)
const mockCreate = jest.fn()
const mockFindFirst = jest.fn()
const mockUpdate = jest.fn()
const mockErrorLog = jest.fn()
const mockWarnLog = jest.fn()
const mockGetPrismaClient = jest.fn()

jest.mock('@lucky/shared/utils/database/prismaClient', () => ({
    getPrismaClient: mockGetPrismaClient,
    disconnectPrisma: jest.fn(),
}))

jest.mock('@lucky/shared/utils/general/log', () => ({
    errorLog: mockErrorLog,
    warnLog: mockWarnLog,
    infoLog: jest.fn(),
    successLog: jest.fn(),
    debugLog: jest.fn(),
    log: {},
    setLogLevel: jest.fn(),
}))

// Now import the module under test
import {
    recordRecommendationPick,
    recordRecommendationOutcome,
    recordRecommendationSkipReason,
    type RecordPickInput,
    type RecordOutcomeArgs,
    type RecordSkipReasonArgs,
} from './recommendationTelemetry'

describe('recommendationTelemetry', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        // Set up the default mock implementation
        mockGetPrismaClient.mockReturnValue({
            recommendation: {
                create: mockCreate,
                findFirst: mockFindFirst,
                update: mockUpdate,
            },
        })
    })

    describe('recordRecommendationPick', () => {
        it('inserts a Recommendation row with correct shape (happy path)', async () => {
            const input: RecordPickInput = {
                guildId: 'guild-123',
                discordUserId: 'user-456',
                trackId: 'track-789',
                title: 'Never Gonna Give You Up',
                author: 'Rick Astley',
                url: 'https://spotify.com/track/123',
                thumbnail: 'https://example.com/thumb.jpg',
                basis: {
                    source: 'spotify-rec',
                    signals: ['preferred artist', 'completed before'],
                },
            }

            mockCreate.mockResolvedValue({
                id: 'rec-id',
                ...input,
                source: PrismaRecommendationSource.SPOTIFY_REC,
                signals: input.basis.signals,
                reason: 'spotify rec • preferred artist • completed before',
                confidence: null,
                isAccepted: null,
                isRejected: null,
                feedback: null,
                createdAt: new Date(),
            })

            await recordRecommendationPick(input)

            expect(mockCreate).toHaveBeenCalledWith({
                data: {
                    guildId: input.guildId,
                    discordUserId: input.discordUserId,
                    trackId: input.trackId,
                    title: input.title,
                    author: input.author,
                    url: input.url,
                    thumbnail: input.thumbnail,
                    source: PrismaRecommendationSource.SPOTIFY_REC,
                    signals: input.basis.signals,
                    reason: 'spotify rec • preferred artist • completed before',
                    confidence: null,
                    mode: null,
                },
            })
        })

        it('allows null discordUserId', async () => {
            const input: RecordPickInput = {
                guildId: 'guild-123',
                discordUserId: undefined,
                trackId: 'track-789',
                title: 'Song',
                author: 'Artist',
                url: 'https://spotify.com/track/123',
                basis: {
                    source: 'lastfm-loved',
                    signals: [],
                },
            }

            mockCreate.mockResolvedValue({})

            await recordRecommendationPick(input)

            const callArgs = mockCreate.mock.calls[0][0]
            expect(callArgs.data.discordUserId).toBeNull()
        })

        it('stores signals array directly in JSON column', async () => {
            const input: RecordPickInput = {
                guildId: 'guild-123',
                trackId: 'track-789',
                title: 'Song',
                author: 'Artist',
                url: 'https://spotify.com/track/123',
                basis: {
                    source: 'genre-tag',
                    signals: [
                        'energy match',
                        'session novelty',
                        'genre family drift',
                    ],
                },
            }

            mockCreate.mockResolvedValue({})

            await recordRecommendationPick(input)

            const callArgs = mockCreate.mock.calls[0][0]
            expect(callArgs.data.signals).toEqual([
                'energy match',
                'session novelty',
                'genre family drift',
            ])
        })

        it('computes reason via serializeBasis', async () => {
            const input: RecordPickInput = {
                guildId: 'guild-123',
                trackId: 'track-789',
                title: 'Song',
                author: 'Artist',
                url: 'https://spotify.com/track/123',
                basis: {
                    source: 'artist-fallback',
                    signals: ['liked artist', 'album match'],
                },
            }

            mockCreate.mockResolvedValue({})

            await recordRecommendationPick(input)

            const callArgs = mockCreate.mock.calls[0][0]
            // serializeBasis should produce: "artist fallback • liked artist • album match"
            expect(callArgs.data.reason).toMatch(/artist fallback/)
            expect(callArgs.data.reason).toMatch(/liked artist/)
            expect(callArgs.data.reason).toMatch(/album match/)
        })

        it('includes confidence if provided', async () => {
            const input: RecordPickInput = {
                guildId: 'guild-123',
                trackId: 'track-789',
                title: 'Song',
                author: 'Artist',
                url: 'https://spotify.com/track/123',
                basis: {
                    source: 'spotify-taste',
                    signals: [],
                },
                confidence: 0.85,
            }

            mockCreate.mockResolvedValue({})

            await recordRecommendationPick(input)

            const callArgs = mockCreate.mock.calls[0][0]
            expect(callArgs.data.confidence).toBe(0.85)
        })

        it('DB error is swallowed and resolved void', async () => {
            const input: RecordPickInput = {
                guildId: 'guild-123',
                trackId: 'track-789',
                title: 'Song',
                author: 'Artist',
                url: 'https://spotify.com/track/123',
                basis: {
                    source: 'spotify-rec',
                    signals: [],
                },
            }

            const testError = new Error('DB connection failed')
            mockCreate.mockRejectedValue(testError)

            // Should not throw
            await expect(
                recordRecommendationPick(input),
            ).resolves.toBeUndefined()
            expect(mockErrorLog).toHaveBeenCalled()
        })
    })

    describe('recordRecommendationOutcome', () => {
        it('updates isAccepted=true for accepted outcome', async () => {
            const args: RecordOutcomeArgs = {
                guildId: 'guild-123',
                trackId: 'track-789',
                outcome: 'accepted',
            }

            const mockRec = {
                id: 'rec-id',
                guildId: 'guild-123',
                trackId: 'track-789',
            }

            mockFindFirst.mockResolvedValue(mockRec)
            mockUpdate.mockResolvedValue({
                ...mockRec,
                isAccepted: true,
            })

            await recordRecommendationOutcome(args)

            expect(mockFindFirst).toHaveBeenCalledWith({
                where: {
                    guildId: 'guild-123',
                    trackId: 'track-789',
                },
                orderBy: {
                    createdAt: 'desc',
                },
                take: 1,
            })

            expect(mockUpdate).toHaveBeenCalledWith({
                where: { id: 'rec-id' },
                data: { isAccepted: true },
            })
        })

        it('updates isRejected=true for rejected outcome', async () => {
            const args: RecordOutcomeArgs = {
                guildId: 'guild-123',
                trackId: 'track-789',
                outcome: 'rejected',
            }

            const mockRec = {
                id: 'rec-id',
                guildId: 'guild-123',
                trackId: 'track-789',
            }

            mockFindFirst.mockResolvedValue(mockRec)
            mockUpdate.mockResolvedValue({
                ...mockRec,
                isRejected: true,
            })

            await recordRecommendationOutcome(args)

            expect(mockUpdate).toHaveBeenCalledWith({
                where: { id: 'rec-id' },
                data: { isRejected: true },
            })
        })

        it('no-op if no matching recommendation found (no update call)', async () => {
            const args: RecordOutcomeArgs = {
                guildId: 'guild-123',
                trackId: 'nonexistent-track',
                outcome: 'accepted',
            }

            mockFindFirst.mockResolvedValue(null)

            await recordRecommendationOutcome(args)

            expect(mockUpdate).not.toHaveBeenCalled()
            expect(mockWarnLog).toHaveBeenCalled()
        })

        it('DB error is swallowed and resolved void', async () => {
            const args: RecordOutcomeArgs = {
                guildId: 'guild-123',
                trackId: 'track-789',
                outcome: 'accepted',
            }

            const testError = new Error('DB connection failed')
            mockFindFirst.mockRejectedValue(testError)

            // Should not throw
            await expect(
                recordRecommendationOutcome(args),
            ).resolves.toBeUndefined()
            expect(mockErrorLog).toHaveBeenCalled()
        })
    })

    describe('recordRecommendationSkipReason', () => {
        it('updates skipReason on recommendation by id (happy path)', async () => {
            const args: RecordSkipReasonArgs = {
                recommendationId: 'rec-id-123',
                skipReason: 'too_chill',
            }

            mockUpdate.mockResolvedValue({
                id: 'rec-id-123',
                skipReason: 'too_chill',
            })

            await recordRecommendationSkipReason(args)

            expect(mockUpdate).toHaveBeenCalledWith({
                where: { id: 'rec-id-123' },
                data: { skipReason: 'too_chill' },
            })
        })

        it('persists generic_dislike skip reason', async () => {
            const args: RecordSkipReasonArgs = {
                recommendationId: 'rec-id-456',
                skipReason: 'generic_dislike',
            }

            mockUpdate.mockResolvedValue({
                id: 'rec-id-456',
                skipReason: 'generic_dislike',
            })

            await recordRecommendationSkipReason(args)

            expect(mockUpdate).toHaveBeenCalledWith({
                where: { id: 'rec-id-456' },
                data: { skipReason: 'generic_dislike' },
            })
        })

        it('persists mood_mismatch skip reason', async () => {
            const args: RecordSkipReasonArgs = {
                recommendationId: 'rec-id-789',
                skipReason: 'mood_mismatch',
            }

            mockUpdate.mockResolvedValue({
                id: 'rec-id-789',
                skipReason: 'mood_mismatch',
            })

            await recordRecommendationSkipReason(args)

            expect(mockUpdate).toHaveBeenCalledWith({
                where: { id: 'rec-id-789' },
                data: { skipReason: 'mood_mismatch' },
            })
        })

        it('persists repeat skip reason', async () => {
            const args: RecordSkipReasonArgs = {
                recommendationId: 'rec-id-101',
                skipReason: 'repeat',
            }

            mockUpdate.mockResolvedValue({
                id: 'rec-id-101',
                skipReason: 'repeat',
            })

            await recordRecommendationSkipReason(args)

            expect(mockUpdate).toHaveBeenCalledWith({
                where: { id: 'rec-id-101' },
                data: { skipReason: 'repeat' },
            })
        })

        it('DB error is swallowed and resolved void (non-blocking)', async () => {
            const args: RecordSkipReasonArgs = {
                recommendationId: 'rec-id-123',
                skipReason: 'too_chill',
            }

            const testError = new Error('DB connection failed')
            mockUpdate.mockRejectedValue(testError)

            // Should not throw
            await expect(
                recordRecommendationSkipReason(args),
            ).resolves.toBeUndefined()
            expect(mockErrorLog).toHaveBeenCalledWith(
                expect.objectContaining({
                    message: expect.stringContaining(
                        'recordRecommendationSkipReason',
                    ),
                }),
            )
        })

        it('returns early without calling update when prisma client is unavailable', async () => {
            mockGetPrismaClient.mockReturnValue(null)
            const args: RecordSkipReasonArgs = {
                recommendationId: 'rec-id-123',
                skipReason: 'too_chill',
            }

            await recordRecommendationSkipReason(args)

            expect(mockUpdate).not.toHaveBeenCalled()
        })

        it('persistence failure does not break skip flow', async () => {
            const args: RecordSkipReasonArgs = {
                recommendationId: 'rec-id-123',
                skipReason: 'generic_dislike',
            }

            mockUpdate.mockRejectedValue(new Error('Network timeout'))

            const result = await recordRecommendationSkipReason(args)

            // Verify the function returns undefined (void) even on error
            expect(result).toBeUndefined()
            // Verify error was logged but not thrown
            expect(mockErrorLog).toHaveBeenCalled()
            // Function should complete without throwing
        })
    })
})
