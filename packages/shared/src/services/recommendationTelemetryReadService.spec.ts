import { describe, expect, it, jest, beforeEach } from '@jest/globals'
import { RecommendationSource } from '../types'

// Mock functions defined first (before jest.mock calls)
const mockGroupBy = jest.fn<any>()
const mockCount = jest.fn<any>()
const mockGetPrismaClient = jest.fn<any>()

jest.mock('../utils/database/prismaClient', () => ({
    getPrismaClient: mockGetPrismaClient,
    disconnectPrisma: jest.fn(),
}))

// Now import the module under test
import {
    getPerSourceAcceptance,
    getPerModeAcceptance,
    getSummary,
    type PerSourceRow,
    type PerModeRow,
    type Summary,
} from './recommendationTelemetryReadService'

describe('recommendationTelemetryReadService', () => {
    beforeEach(() => {
        jest.clearAllMocks()
        // Set up the default mock implementation
        mockGetPrismaClient.mockReturnValue({
            recommendation: {
                groupBy: mockGroupBy,
                count: mockCount,
            },
        })
    })

    describe('getPerSourceAcceptance', () => {
        it('returns empty array when guild has no recommendations', async () => {
            mockGroupBy.mockResolvedValue([])

            const result = await getPerSourceAcceptance('guild-123')

            expect(result).toEqual([])
            expect(mockGroupBy).toHaveBeenCalled()
        })

        it('returns single row for single source with mixed outcomes', async () => {
            const mockGroupResult = [
                {
                    source: RecommendationSource.SPOTIFY_REC,
                    _count: {
                        id: 10,
                    },
                },
            ]
            mockGroupBy.mockResolvedValue(mockGroupResult)

            // Mock count calls for accepted, rejected, pending
            const countCalls = [
                { count: 7 }, // accepted
                { count: 2 }, // rejected
                { count: 1 }, // pending
            ]
            mockCount
                .mockResolvedValueOnce(countCalls[0])
                .mockResolvedValueOnce(countCalls[1])
                .mockResolvedValueOnce(countCalls[2])

            const result = await getPerSourceAcceptance('guild-123')

            expect(result).toHaveLength(1)
            expect(result[0]).toEqual({
                source: RecommendationSource.SPOTIFY_REC,
                count: 10,
                acceptedCount: 7,
                rejectedCount: 2,
                pendingCount: 1,
                acceptanceRate: 7 / 9, // 7 / (7 + 2)
            })
        })

        it('returns multiple rows for multiple sources', async () => {
            const mockGroupResult = [
                {
                    source: RecommendationSource.SPOTIFY_REC,
                    _count: { id: 10 },
                },
                {
                    source: RecommendationSource.LASTFM_LOVED,
                    _count: { id: 5 },
                },
                {
                    source: RecommendationSource.ARTIST_FALLBACK,
                    _count: { id: 3 },
                },
            ]
            mockGroupBy.mockResolvedValue(mockGroupResult)

            // Spotify: 7 accepted, 2 rejected, 1 pending
            mockCount
                .mockResolvedValueOnce({ count: 7 })
                .mockResolvedValueOnce({ count: 2 })
                .mockResolvedValueOnce({ count: 1 })
                // LastFM: 3 accepted, 1 rejected, 1 pending
                .mockResolvedValueOnce({ count: 3 })
                .mockResolvedValueOnce({ count: 1 })
                .mockResolvedValueOnce({ count: 1 })
                // Artist: 2 accepted, 1 rejected, 0 pending
                .mockResolvedValueOnce({ count: 2 })
                .mockResolvedValueOnce({ count: 1 })
                .mockResolvedValueOnce({ count: 0 })

            const result = await getPerSourceAcceptance('guild-123')

            expect(result).toHaveLength(3)
            expect(result[0]).toMatchObject({
                source: RecommendationSource.SPOTIFY_REC,
                count: 10,
                acceptedCount: 7,
                rejectedCount: 2,
                pendingCount: 1,
                acceptanceRate: 7 / 9,
            })
            expect(result[1]).toMatchObject({
                source: RecommendationSource.LASTFM_LOVED,
                count: 5,
                acceptedCount: 3,
                rejectedCount: 1,
                pendingCount: 1,
                acceptanceRate: 3 / 4,
            })
            expect(result[2]).toMatchObject({
                source: RecommendationSource.ARTIST_FALLBACK,
                count: 3,
                acceptedCount: 2,
                rejectedCount: 1,
                pendingCount: 0,
                acceptanceRate: 2 / 3,
            })
        })

        it('returns null acceptanceRate when denominator is zero (all pending)', async () => {
            const mockGroupResult = [
                {
                    source: RecommendationSource.SPOTIFY_REC,
                    _count: { id: 5 },
                },
            ]
            mockGroupBy.mockResolvedValue(mockGroupResult)

            // All pending
            mockCount
                .mockResolvedValueOnce({ count: 0 }) // accepted
                .mockResolvedValueOnce({ count: 0 }) // rejected
                .mockResolvedValueOnce({ count: 5 }) // pending

            const result = await getPerSourceAcceptance('guild-123')

            expect(result[0].acceptanceRate).toBeNull()
        })

        it('handles null source value (legacy/fallback)', async () => {
            const mockGroupResult = [
                {
                    source: null,
                    _count: { id: 2 },
                },
                {
                    source: RecommendationSource.SPOTIFY_REC,
                    _count: { id: 3 },
                },
            ]
            mockGroupBy.mockResolvedValue(mockGroupResult)

            mockCount
                .mockResolvedValueOnce({ count: 1 }) // null: accepted
                .mockResolvedValueOnce({ count: 1 }) // null: rejected
                .mockResolvedValueOnce({ count: 0 }) // null: pending
                .mockResolvedValueOnce({ count: 2 }) // spotify: accepted
                .mockResolvedValueOnce({ count: 1 }) // spotify: rejected
                .mockResolvedValueOnce({ count: 0 }) // spotify: pending

            const result = await getPerSourceAcceptance('guild-123')

            expect(result).toHaveLength(2)
            expect(result[0].source).toBeNull()
            expect(result[0].acceptanceRate).toBe(0.5) // 1/(1+1)
        })

        it('clamps days to [1, 30] range', async () => {
            mockGroupBy.mockResolvedValue([])
            mockCount.mockResolvedValue({ count: 0 })

            // Test with days: 0 (should clamp to 1)
            await getPerSourceAcceptance('guild-123', 0)
            const firstCall = mockGroupBy.mock.calls[0][0] as any
            const minusOneDay = Date.now() - 1 * 86_400_000
            expect(firstCall.where.createdAt.gte.getTime()).toBeCloseTo(
                minusOneDay,
                -2,
            )

            jest.clearAllMocks()
            mockGetPrismaClient.mockReturnValue({
                recommendation: {
                    groupBy: mockGroupBy,
                    count: mockCount,
                },
            })

            // Test with days: 999 (should clamp to 30)
            await getPerSourceAcceptance('guild-123', 999)
            const secondCall = mockGroupBy.mock.calls[0][0] as any
            const minus30Days = Date.now() - 30 * 86_400_000
            expect(secondCall.where.createdAt.gte.getTime()).toBeCloseTo(
                minus30Days,
                -2,
            )
        })

        it('defaults to 7 days when days is undefined', async () => {
            mockGroupBy.mockResolvedValue([])
            mockCount.mockResolvedValue({ count: 0 })

            await getPerSourceAcceptance('guild-123')

            const call = mockGroupBy.mock.calls[0][0] as any
            const minus7Days = Date.now() - 7 * 86_400_000
            expect(call.where.createdAt.gte.getTime()).toBeCloseTo(
                minus7Days,
                -2,
            )
        })
    })

    describe('getPerModeAcceptance', () => {
        it('returns empty array when guild has no recommendations', async () => {
            mockGroupBy.mockResolvedValue([])

            const result = await getPerModeAcceptance('guild-123')

            expect(result).toEqual([])
            expect(mockGroupBy).toHaveBeenCalled()
        })

        it('returns rows for all three modes', async () => {
            const mockGroupResult = [
                { mode: 'similar', _count: { id: 10 } },
                { mode: 'discover', _count: { id: 8 } },
                { mode: 'popular', _count: { id: 6 } },
            ]
            mockGroupBy.mockResolvedValue(mockGroupResult)

            // similar: 7 accepted, 2 rejected, 1 pending
            mockCount
                .mockResolvedValueOnce({ count: 7 })
                .mockResolvedValueOnce({ count: 2 })
                .mockResolvedValueOnce({ count: 1 })
                // discover: 5 accepted, 2 rejected, 1 pending
                .mockResolvedValueOnce({ count: 5 })
                .mockResolvedValueOnce({ count: 2 })
                .mockResolvedValueOnce({ count: 1 })
                // popular: 4 accepted, 1 rejected, 1 pending
                .mockResolvedValueOnce({ count: 4 })
                .mockResolvedValueOnce({ count: 1 })
                .mockResolvedValueOnce({ count: 1 })

            const result = await getPerModeAcceptance('guild-123')

            expect(result).toHaveLength(3)
            expect(result[0]).toEqual({
                mode: 'similar',
                count: 10,
                acceptedCount: 7,
                rejectedCount: 2,
                pendingCount: 1,
                acceptanceRate: 7 / 9,
            })
            expect(result[1]).toEqual({
                mode: 'discover',
                count: 8,
                acceptedCount: 5,
                rejectedCount: 2,
                pendingCount: 1,
                acceptanceRate: 5 / 7,
            })
            expect(result[2]).toEqual({
                mode: 'popular',
                count: 6,
                acceptedCount: 4,
                rejectedCount: 1,
                pendingCount: 1,
                acceptanceRate: 4 / 5,
            })
        })

        it('handles null mode value (pre-migration rows)', async () => {
            const mockGroupResult = [
                { mode: null, _count: { id: 2 } },
                { mode: 'similar', _count: { id: 5 } },
            ]
            mockGroupBy.mockResolvedValue(mockGroupResult)

            mockCount
                .mockResolvedValueOnce({ count: 1 }) // null: accepted
                .mockResolvedValueOnce({ count: 1 }) // null: rejected
                .mockResolvedValueOnce({ count: 0 }) // null: pending
                .mockResolvedValueOnce({ count: 4 }) // similar: accepted
                .mockResolvedValueOnce({ count: 1 }) // similar: rejected
                .mockResolvedValueOnce({ count: 0 }) // similar: pending

            const result = await getPerModeAcceptance('guild-123')

            expect(result).toHaveLength(2)
            expect(result[0].mode).toBeNull()
            expect(result[0].acceptanceRate).toBe(0.5) // 1/(1+1)
            expect(result[1].mode).toBe('similar')
        })

        it('returns null acceptanceRate when all pending', async () => {
            const mockGroupResult = [{ mode: 'similar', _count: { id: 5 } }]
            mockGroupBy.mockResolvedValue(mockGroupResult)

            mockCount
                .mockResolvedValueOnce({ count: 0 }) // accepted
                .mockResolvedValueOnce({ count: 0 }) // rejected
                .mockResolvedValueOnce({ count: 5 }) // pending

            const result = await getPerModeAcceptance('guild-123')

            expect(result[0].acceptanceRate).toBeNull()
        })

        it('clamps days to [1, 30] range', async () => {
            mockGroupBy.mockResolvedValue([])
            mockCount.mockResolvedValue({ count: 0 })

            // Test with days: 0 (should clamp to 1)
            await getPerModeAcceptance('guild-123', 0)
            const firstCall = mockGroupBy.mock.calls[0][0] as any
            const minusOneDay = Date.now() - 1 * 86_400_000
            expect(firstCall.where.createdAt.gte.getTime()).toBeCloseTo(
                minusOneDay,
                -2,
            )

            jest.clearAllMocks()
            mockGetPrismaClient.mockReturnValue({
                recommendation: {
                    groupBy: mockGroupBy,
                    count: mockCount,
                },
            })

            // Test with days: 999 (should clamp to 30)
            await getPerModeAcceptance('guild-123', 999)
            const secondCall = mockGroupBy.mock.calls[0][0] as any
            const minus30Days = Date.now() - 30 * 86_400_000
            expect(secondCall.where.createdAt.gte.getTime()).toBeCloseTo(
                minus30Days,
                -2,
            )
        })

        it('defaults to 7 days when days is undefined', async () => {
            mockGroupBy.mockResolvedValue([])
            mockCount.mockResolvedValue({ count: 0 })

            await getPerModeAcceptance('guild-123')

            const call = mockGroupBy.mock.calls[0][0] as any
            const minus7Days = Date.now() - 7 * 86_400_000
            expect(call.where.createdAt.gte.getTime()).toBeCloseTo(
                minus7Days,
                -2,
            )
        })
    })

    describe('getSummary', () => {
        it('returns aggregated totals for happy path', async () => {
            mockCount
                .mockResolvedValueOnce({ count: 100 }) // total picks
                .mockResolvedValueOnce({ count: 65 }) // accepted
                .mockResolvedValueOnce({ count: 25 }) // rejected
                .mockResolvedValueOnce({ count: 10 }) // pending

            const result = await getSummary('guild-123')

            expect(result).toEqual({
                totalPicks: 100,
                accepted: 65,
                rejected: 25,
                pending: 10,
                globalAcceptanceRate: 65 / (65 + 25), // 65 / 90
            })
        })

        it('returns zeros for empty guild', async () => {
            mockCount
                .mockResolvedValueOnce({ count: 0 }) // total
                .mockResolvedValueOnce({ count: 0 }) // accepted
                .mockResolvedValueOnce({ count: 0 }) // rejected
                .mockResolvedValueOnce({ count: 0 }) // pending

            const result = await getSummary('guild-123')

            expect(result).toEqual({
                totalPicks: 0,
                accepted: 0,
                rejected: 0,
                pending: 0,
                globalAcceptanceRate: null,
            })
        })

        it('returns null globalAcceptanceRate when all pending', async () => {
            mockCount
                .mockResolvedValueOnce({ count: 50 }) // total
                .mockResolvedValueOnce({ count: 0 }) // accepted
                .mockResolvedValueOnce({ count: 0 }) // rejected
                .mockResolvedValueOnce({ count: 50 }) // pending

            const result = await getSummary('guild-123')

            expect(result).toEqual({
                totalPicks: 50,
                accepted: 0,
                rejected: 0,
                pending: 50,
                globalAcceptanceRate: null,
            })
        })

        it('clamps days to [1, 30] range', async () => {
            mockCount.mockResolvedValue({ count: 0 })

            // Test with days: 0 (should clamp to 1)
            await getSummary('guild-123', 0)
            const firstCall = mockCount.mock.calls[0][0] as any
            const minusOneDay = Date.now() - 1 * 86_400_000
            expect(firstCall.where.createdAt.gte.getTime()).toBeCloseTo(
                minusOneDay,
                -2,
            )

            jest.clearAllMocks()
            mockGetPrismaClient.mockReturnValue({
                recommendation: {
                    groupBy: mockGroupBy,
                    count: mockCount,
                },
            })

            // Test with days: 50 (should clamp to 30)
            await getSummary('guild-123', 50)
            const secondCall = mockCount.mock.calls[0][0] as any
            const minus30Days = Date.now() - 30 * 86_400_000
            expect(secondCall.where.createdAt.gte.getTime()).toBeCloseTo(
                minus30Days,
                -2,
            )
        })

        it('defaults to 7 days when days is undefined', async () => {
            mockCount.mockResolvedValue({ count: 0 })

            await getSummary('guild-123')

            const call = mockCount.mock.calls[0][0] as any
            const minus7Days = Date.now() - 7 * 86_400_000
            expect(call.where.createdAt.gte.getTime()).toBeCloseTo(
                minus7Days,
                -2,
            )
        })
    })
})
