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
    getAutoplaySkipRateForGuild,
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
            // One groupBy over [source, isAccepted, isRejected] — one bucket
            // per outcome combination (#1187)
            mockGroupBy.mockResolvedValue([
                {
                    source: RecommendationSource.SPOTIFY_REC,
                    isAccepted: true,
                    isRejected: null,
                    _count: { id: 7 },
                },
                {
                    source: RecommendationSource.SPOTIFY_REC,
                    isAccepted: null,
                    isRejected: true,
                    _count: { id: 2 },
                },
                {
                    source: RecommendationSource.SPOTIFY_REC,
                    isAccepted: null,
                    isRejected: null,
                    _count: { id: 1 },
                },
            ])

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
            // The N+1 per-source count loop is gone: exactly one query total
            expect(mockGroupBy).toHaveBeenCalledTimes(1)
            expect(mockCount).not.toHaveBeenCalled()
        })

        it('returns multiple rows for multiple sources', async () => {
            mockGroupBy.mockResolvedValue([
                // Spotify: 7 accepted, 2 rejected, 1 pending
                {
                    source: RecommendationSource.SPOTIFY_REC,
                    isAccepted: true,
                    isRejected: null,
                    _count: { id: 7 },
                },
                {
                    source: RecommendationSource.SPOTIFY_REC,
                    isAccepted: null,
                    isRejected: true,
                    _count: { id: 2 },
                },
                {
                    source: RecommendationSource.SPOTIFY_REC,
                    isAccepted: null,
                    isRejected: null,
                    _count: { id: 1 },
                },
                // LastFM: 3 accepted, 1 rejected, 1 pending
                {
                    source: RecommendationSource.LASTFM_LOVED,
                    isAccepted: true,
                    isRejected: null,
                    _count: { id: 3 },
                },
                {
                    source: RecommendationSource.LASTFM_LOVED,
                    isAccepted: null,
                    isRejected: true,
                    _count: { id: 1 },
                },
                {
                    source: RecommendationSource.LASTFM_LOVED,
                    isAccepted: null,
                    isRejected: null,
                    _count: { id: 1 },
                },
                // Artist: 2 accepted, 1 rejected, 0 pending
                {
                    source: RecommendationSource.ARTIST_FALLBACK,
                    isAccepted: true,
                    isRejected: null,
                    _count: { id: 2 },
                },
                {
                    source: RecommendationSource.ARTIST_FALLBACK,
                    isAccepted: null,
                    isRejected: true,
                    _count: { id: 1 },
                },
            ])

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
            expect(mockGroupBy).toHaveBeenCalledTimes(1)
            expect(mockCount).not.toHaveBeenCalled()
        })

        it('returns null acceptanceRate when denominator is zero (all pending)', async () => {
            mockGroupBy.mockResolvedValue([
                {
                    source: RecommendationSource.SPOTIFY_REC,
                    isAccepted: null,
                    isRejected: null,
                    _count: { id: 5 },
                },
            ])

            const result = await getPerSourceAcceptance('guild-123')

            expect(result[0].acceptanceRate).toBeNull()
        })

        it('handles null source value (legacy/fallback)', async () => {
            mockGroupBy.mockResolvedValue([
                {
                    source: null,
                    isAccepted: true,
                    isRejected: null,
                    _count: { id: 1 },
                },
                {
                    source: null,
                    isAccepted: null,
                    isRejected: true,
                    _count: { id: 1 },
                },
                {
                    source: RecommendationSource.SPOTIFY_REC,
                    isAccepted: true,
                    isRejected: null,
                    _count: { id: 2 },
                },
                {
                    source: RecommendationSource.SPOTIFY_REC,
                    isAccepted: null,
                    isRejected: true,
                    _count: { id: 1 },
                },
            ])

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

        it('groups by the mode column', async () => {
            mockGroupBy.mockResolvedValue([])

            await getPerModeAcceptance('guild-123')

            expect(mockGroupBy).toHaveBeenCalledWith(
                expect.objectContaining({
                    by: ['mode', 'isAccepted', 'isRejected'],
                }),
            )
        })

        it('returns rows for all three modes', async () => {
            mockGroupBy.mockResolvedValue([
                // similar: 7 accepted, 2 rejected, 1 pending
                {
                    mode: 'similar',
                    isAccepted: true,
                    isRejected: null,
                    _count: { id: 7 },
                },
                {
                    mode: 'similar',
                    isAccepted: null,
                    isRejected: true,
                    _count: { id: 2 },
                },
                {
                    mode: 'similar',
                    isAccepted: null,
                    isRejected: null,
                    _count: { id: 1 },
                },
                // discover: 5 accepted, 2 rejected, 1 pending
                {
                    mode: 'discover',
                    isAccepted: true,
                    isRejected: null,
                    _count: { id: 5 },
                },
                {
                    mode: 'discover',
                    isAccepted: null,
                    isRejected: true,
                    _count: { id: 2 },
                },
                {
                    mode: 'discover',
                    isAccepted: null,
                    isRejected: null,
                    _count: { id: 1 },
                },
                // popular: 4 accepted, 1 rejected, 1 pending
                {
                    mode: 'popular',
                    isAccepted: true,
                    isRejected: null,
                    _count: { id: 4 },
                },
                {
                    mode: 'popular',
                    isAccepted: null,
                    isRejected: true,
                    _count: { id: 1 },
                },
                {
                    mode: 'popular',
                    isAccepted: null,
                    isRejected: null,
                    _count: { id: 1 },
                },
            ])

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
            expect(mockGroupBy).toHaveBeenCalledTimes(1)
            expect(mockCount).not.toHaveBeenCalled()
        })

        it('handles null mode value (pre-migration rows)', async () => {
            mockGroupBy.mockResolvedValue([
                {
                    mode: null,
                    isAccepted: true,
                    isRejected: null,
                    _count: { id: 1 },
                },
                {
                    mode: null,
                    isAccepted: null,
                    isRejected: true,
                    _count: { id: 1 },
                },
                {
                    mode: 'similar',
                    isAccepted: true,
                    isRejected: null,
                    _count: { id: 4 },
                },
                {
                    mode: 'similar',
                    isAccepted: null,
                    isRejected: true,
                    _count: { id: 1 },
                },
            ])

            const result = await getPerModeAcceptance('guild-123')

            expect(result).toHaveLength(2)
            expect(result[0].mode).toBeNull()
            expect(result[0].acceptanceRate).toBe(0.5) // 1/(1+1)
            expect(result[1].mode).toBe('similar')
        })

        it('returns null acceptanceRate when all pending', async () => {
            mockGroupBy.mockResolvedValue([
                {
                    mode: 'similar',
                    isAccepted: null,
                    isRejected: null,
                    _count: { id: 5 },
                },
            ])

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

        it('queries each bucket with the correct accept/reject filters', async () => {
            mockCount
                .mockResolvedValueOnce({ count: 100 }) // total picks
                .mockResolvedValueOnce({ count: 65 }) // accepted
                .mockResolvedValueOnce({ count: 25 }) // rejected
                .mockResolvedValueOnce({ count: 10 }) // pending

            await getSummary('guild-xyz')

            const where = (i: number) =>
                (mockCount.mock.calls[i][0] as any).where

            // total picks: no accept/reject filter
            expect(where(0)).toEqual(
                expect.objectContaining({ guildId: 'guild-xyz' }),
            )
            expect(where(0).isAccepted).toBeUndefined()
            expect(where(0).isRejected).toBeUndefined()
            // accepted bucket filters isAccepted: true
            expect(where(1)).toEqual(
                expect.objectContaining({
                    guildId: 'guild-xyz',
                    isAccepted: true,
                }),
            )
            // rejected bucket filters isRejected: true
            expect(where(2)).toEqual(
                expect.objectContaining({
                    guildId: 'guild-xyz',
                    isRejected: true,
                }),
            )
            // pending bucket filters both null
            expect(where(3)).toEqual(
                expect.objectContaining({
                    guildId: 'guild-xyz',
                    isAccepted: null,
                    isRejected: null,
                }),
            )
            // every bucket carries the rolling time window
            for (let i = 0; i < 4; i++) {
                expect(where(i).createdAt.gte).toBeInstanceOf(Date)
            }
        })

        it('handles prisma count returning a plain number', async () => {
            mockCount.mockResolvedValue(7) // plain number, not { count }

            const result = await getSummary('guild-123')

            expect(result.totalPicks).toBe(7)
            expect(result.accepted).toBe(7)
        })
    })

    describe('getAutoplaySkipRateForGuild', () => {
        const mockGuildId = 'guild-123'

        it('returns skip rate when sample >= minimum (5 resolved outcomes)', async () => {
            mockCount.mockResolvedValueOnce(3).mockResolvedValueOnce(2)

            const result = await getAutoplaySkipRateForGuild(mockGuildId)

            expect(result).toEqual({
                skipRate: 0.4,
                sampleSize: 5,
                acceptedCount: 3,
                rejectedCount: 2,
                canTrip: true,
            })
        })

        it('returns canTrip=false when sample < minimum (< 5 resolved)', async () => {
            mockCount.mockResolvedValueOnce(2).mockResolvedValueOnce(1)

            const result = await getAutoplaySkipRateForGuild(mockGuildId)

            expect(result).toEqual({
                skipRate: 1 / 3,
                sampleSize: 3,
                acceptedCount: 2,
                rejectedCount: 1,
                canTrip: false,
            })
        })

        it('returns 0% skip rate with no rejections', async () => {
            mockCount.mockResolvedValueOnce(10).mockResolvedValueOnce(0)

            const result = await getAutoplaySkipRateForGuild(mockGuildId)

            expect(result).toEqual({
                skipRate: 0,
                sampleSize: 10,
                acceptedCount: 10,
                rejectedCount: 0,
                canTrip: true,
            })
        })

        it('returns 100% skip rate with no acceptances', async () => {
            mockCount.mockResolvedValueOnce(0).mockResolvedValueOnce(5)

            const result = await getAutoplaySkipRateForGuild(mockGuildId)

            expect(result).toEqual({
                skipRate: 1,
                sampleSize: 5,
                acceptedCount: 0,
                rejectedCount: 5,
                canTrip: true,
            })
        })

        it('applies a 24-hour window and does not filter by mode', async () => {
            mockCount.mockResolvedValueOnce(3).mockResolvedValueOnce(2)

            await getAutoplaySkipRateForGuild(mockGuildId)

            expect(mockCount).toHaveBeenCalledTimes(2)
            for (const call of mockCount.mock.calls) {
                expect((call[0] as any).where?.createdAt?.gte).toBeDefined()
                expect((call[0] as any).where?.guildId).toBe(mockGuildId)
                expect((call[0] as any).where?.mode).toBeUndefined()
            }
        })

        it('returns null skip rate when no resolved outcomes', async () => {
            mockCount.mockResolvedValueOnce(0).mockResolvedValueOnce(0)

            const result = await getAutoplaySkipRateForGuild(mockGuildId)

            expect(result).toEqual({
                skipRate: null,
                sampleSize: 0,
                acceptedCount: 0,
                rejectedCount: 0,
                canTrip: false,
            })
        })

        it('filters by isAccepted/isRejected and a precise 24h window', async () => {
            mockCount.mockResolvedValueOnce(3).mockResolvedValueOnce(2)
            const before = Date.now()

            await getAutoplaySkipRateForGuild('guild-aa')

            const w0 = (mockCount.mock.calls[0][0] as any).where
            const w1 = (mockCount.mock.calls[1][0] as any).where
            // accepted query
            expect(w0).toEqual(
                expect.objectContaining({
                    guildId: 'guild-aa',
                    isAccepted: true,
                }),
            )
            // rejected query
            expect(w1).toEqual(
                expect.objectContaining({
                    guildId: 'guild-aa',
                    isRejected: true,
                }),
            )
            // exactly a 24h window (catches arithmetic drift in the cutoff)
            const expectedGte = before - 24 * 60 * 60 * 1000
            const gte = w0.createdAt.gte.getTime()
            expect(gte).toBeGreaterThan(expectedGte - 5_000)
            expect(gte).toBeLessThan(expectedGte + 5_000)
        })

        it('handles prisma count returning { count } objects', async () => {
            mockCount
                .mockResolvedValueOnce({ count: 4 })
                .mockResolvedValueOnce({ count: 1 })

            const result = await getAutoplaySkipRateForGuild('guild-bb')

            expect(result).toEqual(
                expect.objectContaining({
                    acceptedCount: 4,
                    rejectedCount: 1,
                    sampleSize: 5,
                }),
            )
        })
    })
})
