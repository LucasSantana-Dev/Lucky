import { describe, it, expect, beforeEach, jest } from '@jest/globals'

const mockQueryRaw = jest.fn<() => Promise<unknown>>()
const mockTrackHistoryDeleteMany = jest.fn<(args?: any) => Promise<any>>()
const mockRateLimitFindUnique = jest.fn<(args?: any) => Promise<any>>()
const mockRateLimitUpsert = jest.fn<(args?: any) => Promise<any>>()
const mockRateLimitUpdate = jest.fn<(args?: any) => Promise<any>>()
const mockRateLimitDeleteMany = jest.fn<(args?: any) => Promise<any>>()
const mockServerLogDeleteMany = jest.fn<(args?: any) => Promise<any>>()
const mockUserFeedbackDeleteMany = jest.fn<(args?: any) => Promise<any>>()
const mockCommandEventDeleteMany = jest.fn<(args?: any) => Promise<any>>()
const mockActivationEventDeleteMany = jest.fn<(args?: any) => Promise<any>>()
const mockInviteClickDeleteMany = jest.fn<(args?: any) => Promise<any>>()
const mockTopggVoteEventDeleteMany = jest.fn<(args?: any) => Promise<any>>()
const mockGetPrismaClient = jest.fn<() => any>()

jest.mock('../../utils/database/prismaClient', () => ({
    getPrismaClient: mockGetPrismaClient,
}))

jest.mock('../../utils/general/log', () => ({
    errorLog: jest.fn(),
}))

import { DatabaseService } from './DatabaseService'
import { errorLog } from '../../utils/general/log'

describe('DatabaseService', () => {
    let service: DatabaseService

    beforeEach(() => {
        jest.clearAllMocks()
        mockGetPrismaClient.mockReturnValue({
            $queryRaw: mockQueryRaw,
            trackHistory: {
                deleteMany: mockTrackHistoryDeleteMany,
            },
            rateLimit: {
                findUnique: mockRateLimitFindUnique,
                upsert: mockRateLimitUpsert,
                update: mockRateLimitUpdate,
                deleteMany: mockRateLimitDeleteMany,
            },
            serverLog: {
                deleteMany: mockServerLogDeleteMany,
            },
            commandEvent: {
                deleteMany: mockCommandEventDeleteMany,
            },
            userFeedback: {
                deleteMany: mockUserFeedbackDeleteMany,
            },
            activationEvent: {
                deleteMany: mockActivationEventDeleteMany,
            },
            inviteClick: {
                deleteMany: mockInviteClickDeleteMany,
            },
            topggVoteEvent: {
                deleteMany: mockTopggVoteEventDeleteMany,
            },
        })
        mockServerLogDeleteMany.mockResolvedValue({ count: 0 })
        mockUserFeedbackDeleteMany.mockResolvedValue({ count: 0 })
        mockCommandEventDeleteMany.mockResolvedValue({ count: 0 })
        mockActivationEventDeleteMany.mockResolvedValue({ count: 0 })
        mockInviteClickDeleteMany.mockResolvedValue({ count: 0 })
        mockTopggVoteEventDeleteMany.mockResolvedValue({ count: 0 })
        service = new DatabaseService()
    })

    describe('checkRateLimit', () => {
        const hit = async (count: number, limit = 3) => {
            mockQueryRaw.mockResolvedValue([{ count }])
            return service.checkRateLimit('user-123', limit, 60000)
        }

        it('allows the first hit (new window)', async () => {
            const result = await hit(1)

            expect(result.isSuccess()).toBe(true)
            expect(result.getData()).toBe(true)
        })

        it('allows request when under limit', async () => {
            expect((await hit(2)).getData()).toBe(true)
        })

        it('allows the request that reaches the limit', async () => {
            expect((await hit(3)).getData()).toBe(true)
        })

        it('denies request over the limit', async () => {
            expect((await hit(4)).getData()).toBe(false)
        })

        it('uses one atomic parameterized statement with no read/write split', async () => {
            await hit(1)

            expect(mockQueryRaw).toHaveBeenCalledTimes(1)
            const [strings, ...values] = mockQueryRaw.mock
                .calls[0] as unknown as [string[], ...unknown[]]
            expect(strings.join('?').replace(/\s+/g, ' ').trim()).toBe(
                'INSERT INTO "rate_limits" ("id", "key", "count", "resetAt") ' +
                    'VALUES (?, ?, 1, ?) ' +
                    'ON CONFLICT ("key") DO UPDATE SET ' +
                    '"count" = CASE WHEN "rate_limits"."resetAt" < ? ' +
                    'THEN 1 ELSE "rate_limits"."count" + 1 END, ' +
                    '"resetAt" = CASE WHEN "rate_limits"."resetAt" < ? ' +
                    'THEN ? ELSE "rate_limits"."resetAt" END ' +
                    'RETURNING "count"',
            )
            // order: id, key, new resetAt, now, now, new resetAt
            expect(values).toHaveLength(6)
            expect(typeof values[0]).toBe('string')
            expect(values[1]).toBe('user-123')
            expect(values[2]).toBeInstanceOf(Date)
            expect(values[3]).toBeInstanceOf(Date)
            expect(values[4]).toBe(values[3])
            expect(values[5]).toBe(values[2])
            expect((values[2] as Date).getTime()).toBe(
                (values[3] as Date).getTime() + 60000,
            )
            expect(mockRateLimitFindUnique).not.toHaveBeenCalled()
            expect(mockRateLimitUpsert).not.toHaveBeenCalled()
            expect(mockRateLimitUpdate).not.toHaveBeenCalled()
        })

        it('resets and admits when the window expired (db returns count 1)', async () => {
            const result = await hit(1, 1)

            expect(result.getData()).toBe(true)
            const [strings] = mockQueryRaw.mock.calls[0] as unknown as [
                string[],
            ]
            expect(strings.join('?')).toContain('THEN 1')
        })

        it('returns failure on database error', async () => {
            mockQueryRaw.mockRejectedValue(new Error('DB connection failed'))

            const result = await service.checkRateLimit('user-123', 10, 60000)

            expect(result.isFailure()).toBe(true)
        })

        it('returns failure when the statement returns no row', async () => {
            mockQueryRaw.mockResolvedValue([])

            const result = await service.checkRateLimit('user-123', 10, 60000)

            expect(result.isFailure()).toBe(true)
        })
    })

    describe('cleanupOldData', () => {
        it('deletes old tracks, rate limits, server logs, and user feedback, returns total count', async () => {
            mockTrackHistoryDeleteMany.mockResolvedValue({ count: 50 })
            mockRateLimitDeleteMany.mockResolvedValue({ count: 30 })
            mockServerLogDeleteMany.mockResolvedValue({ count: 20 })
            mockUserFeedbackDeleteMany.mockResolvedValue({ count: 5 })

            const result = await service.cleanupOldData()

            expect(result.isSuccess()).toBe(true)
            expect(result.getData()).toBe(105)
            expect(mockTrackHistoryDeleteMany).toHaveBeenCalled()
            expect(mockRateLimitDeleteMany).toHaveBeenCalled()
            expect(mockServerLogDeleteMany).toHaveBeenCalled()
            expect(mockUserFeedbackDeleteMany).toHaveBeenCalled()
        })

        it('deletes user feedback older than 180 days (#2477 retention)', async () => {
            mockTrackHistoryDeleteMany.mockResolvedValue({ count: 0 })
            mockRateLimitDeleteMany.mockResolvedValue({ count: 0 })
            mockServerLogDeleteMany.mockResolvedValue({ count: 0 })
            mockUserFeedbackDeleteMany.mockResolvedValue({ count: 7 })

            const before = Date.now()
            const result = await service.cleanupOldData()
            const after = Date.now()

            expect(result.isSuccess()).toBe(true)
            expect(result.getData()).toBe(7)
            expect(mockUserFeedbackDeleteMany).toHaveBeenCalledWith({
                where: { createdAt: { lt: expect.any(Date) } },
            })
            const cutoff = mockUserFeedbackDeleteMany.mock.calls[0]?.[0].where
                .createdAt.lt as Date
            const oneHundredEightyDaysMs = 180 * 24 * 60 * 60 * 1000
            expect(cutoff.getTime()).toBeGreaterThanOrEqual(
                before - oneHundredEightyDaysMs - 1000,
            )
            expect(cutoff.getTime()).toBeLessThanOrEqual(
                after - oneHundredEightyDaysMs + 1000,
            )
        })

        it('deletes activation events older than 180 days and counts them', async () => {
            mockTrackHistoryDeleteMany.mockResolvedValue({ count: 0 })
            mockRateLimitDeleteMany.mockResolvedValue({ count: 0 })
            mockServerLogDeleteMany.mockResolvedValue({ count: 0 })
            mockUserFeedbackDeleteMany.mockResolvedValue({ count: 0 })
            mockActivationEventDeleteMany.mockResolvedValue({ count: 4 })

            const before = Date.now()
            const result = await service.cleanupOldData()

            expect(result.isSuccess()).toBe(true)
            expect(result.getData()).toBe(4)
            expect(mockActivationEventDeleteMany).toHaveBeenCalledWith({
                where: { occurredAt: { lt: expect.any(Date) } },
            })
            const cutoff = mockActivationEventDeleteMany.mock.calls[0]?.[0]
                .where.occurredAt.lt as Date
            const days180 = 180 * 24 * 60 * 60 * 1000
            expect(cutoff.getTime()).toBeGreaterThanOrEqual(
                before - days180 - 1000,
            )
            expect(cutoff.getTime()).toBeLessThanOrEqual(
                Date.now() - days180 + 1000,
            )
        })

        it('prunes invite clicks after 180 days and vote events after 400 days (#2395)', async () => {
            mockTrackHistoryDeleteMany.mockResolvedValue({ count: 0 })
            mockRateLimitDeleteMany.mockResolvedValue({ count: 0 })
            mockInviteClickDeleteMany.mockResolvedValue({ count: 2 })
            mockTopggVoteEventDeleteMany.mockResolvedValue({ count: 3 })

            const before = Date.now()
            const result = await service.cleanupOldData()
            const after = Date.now()

            expect(result.getData()).toBe(5)
            const day = 24 * 60 * 60 * 1000
            for (const [mock, days] of [
                [mockInviteClickDeleteMany, 180],
                [mockTopggVoteEventDeleteMany, 400],
            ] as const) {
                expect(mock).toHaveBeenCalledWith({
                    where: { occurredAt: { lt: expect.any(Date) } },
                })
                const cutoff = (
                    mock.mock.calls[0]?.[0].where.occurredAt.lt as Date
                ).getTime()
                expect(cutoff).toBeGreaterThanOrEqual(
                    before - days * day - 1000,
                )
                expect(cutoff).toBeLessThanOrEqual(after - days * day + 1000)
            }
        })

        it('deletes command events older than 180 days and counts them (#2391)', async () => {
            mockTrackHistoryDeleteMany.mockResolvedValue({ count: 1 })
            mockRateLimitDeleteMany.mockResolvedValue({ count: 0 })
            mockServerLogDeleteMany.mockResolvedValue({ count: 0 })
            mockUserFeedbackDeleteMany.mockResolvedValue({ count: 0 })
            mockCommandEventDeleteMany.mockResolvedValue({ count: 9 })

            const before = Date.now()
            const result = await service.cleanupOldData()

            expect(result.isSuccess()).toBe(true)
            expect(result.getData()).toBe(10)
            expect(mockCommandEventDeleteMany).toHaveBeenCalledWith({
                where: { occurredAt: { lt: expect.any(Date) } },
            })
            const cutoff = mockCommandEventDeleteMany.mock.calls[0]?.[0].where
                .occurredAt.lt as Date
            const ms = 180 * 24 * 60 * 60 * 1000
            expect(cutoff.getTime()).toBeGreaterThanOrEqual(before - ms - 1000)
            expect(cutoff.getTime()).toBeLessThanOrEqual(Date.now() - ms + 1000)
        })

        it('deletes server logs older than 30 days', async () => {
            mockTrackHistoryDeleteMany.mockResolvedValue({ count: 0 })
            mockRateLimitDeleteMany.mockResolvedValue({ count: 0 })
            mockServerLogDeleteMany.mockResolvedValue({ count: 15 })

            const before = Date.now()
            const result = await service.cleanupOldData()
            const after = Date.now()

            expect(result.isSuccess()).toBe(true)
            expect(result.getData()).toBe(15)
            expect(mockServerLogDeleteMany).toHaveBeenCalledWith({
                where: { createdAt: { lt: expect.any(Date) } },
            })
            const cutoff = mockServerLogDeleteMany.mock.calls[0]?.[0].where
                .createdAt.lt as Date
            const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000
            // Cutoff should be ~30 days before "now", bounded by the call window
            expect(cutoff.getTime()).toBeGreaterThanOrEqual(
                before - thirtyDaysMs - 1000,
            )
            expect(cutoff.getTime()).toBeLessThanOrEqual(
                after - thirtyDaysMs + 1000,
            )
        })

        it('handles zero deletions', async () => {
            mockTrackHistoryDeleteMany.mockResolvedValue({ count: 0 })
            mockRateLimitDeleteMany.mockResolvedValue({ count: 0 })

            const result = await service.cleanupOldData()

            expect(result.isSuccess()).toBe(true)
            expect(result.getData()).toBe(0)
        })

        it('returns failure on track deletion error', async () => {
            mockTrackHistoryDeleteMany.mockRejectedValue(
                new Error('Deletion failed'),
            )

            const result = await service.cleanupOldData()

            expect(result.isFailure()).toBe(true)
        })

        it('returns failure on rate limit deletion error', async () => {
            mockTrackHistoryDeleteMany.mockResolvedValue({ count: 10 })
            mockRateLimitDeleteMany.mockRejectedValue(
                new Error('Rate limit deletion failed'),
            )

            const result = await service.cleanupOldData()

            expect(result.isFailure()).toBe(true)
        })

        it('returns failure on server log deletion error', async () => {
            mockTrackHistoryDeleteMany.mockResolvedValue({ count: 10 })
            mockRateLimitDeleteMany.mockResolvedValue({ count: 5 })
            mockServerLogDeleteMany.mockRejectedValue(
                new Error('Server log deletion failed'),
            )

            const result = await service.cleanupOldData()

            expect(result.isFailure()).toBe(true)
        })
    })

    // Mutation-hardening (#1426): the tests above assert outcomes; these assert
    // the exact query clauses, default values, validation guards, and error
    // labels so mutants that blank a `where`/`data`/`orderBy`, flip a default,
    // or weaken a type guard are KILLED rather than surviving silently.
    describe('query-clause assertions (kill ObjectLiteral mutants)', () => {
        it('cleanupOldData deletes by playedAt, resetAt, and createdAt cutoffs and sums counts', async () => {
            mockTrackHistoryDeleteMany.mockResolvedValue({ count: 3 })
            mockRateLimitDeleteMany.mockResolvedValue({ count: 2 })
            mockServerLogDeleteMany.mockResolvedValue({ count: 4 })
            mockUserFeedbackDeleteMany.mockResolvedValue({ count: 1 })

            const result = await service.cleanupOldData()

            // 3 + 2 + 4 + 1 = 10 (kills the + -> - arithmetic mutant)
            expect(result.getData()).toBe(10)
            expect(mockTrackHistoryDeleteMany).toHaveBeenCalledWith({
                where: { playedAt: { lt: expect.any(Date) } },
            })
            expect(mockRateLimitDeleteMany).toHaveBeenCalledWith({
                where: { resetAt: { lt: expect.any(Date) } },
            })
            expect(mockServerLogDeleteMany).toHaveBeenCalledWith({
                where: { createdAt: { lt: expect.any(Date) } },
            })
        })
    })

    describe('rate-limit branches (kill conditional/boundary mutants)', () => {
        it('denies just over the limit boundary (count === limit + 1)', async () => {
            mockQueryRaw.mockResolvedValue([{ count: 6 }])

            const result = await service.checkRateLimit('k', 5, 60000)

            expect(result.getData()).toBe(false)
        })

        it('admits exactly at the limit boundary (count === limit)', async () => {
            mockQueryRaw.mockResolvedValue([{ count: 5 }])

            const result = await service.checkRateLimit('k', 5, 60000)

            expect(result.getData()).toBe(true)
        })

        it('binds key and a window end of now + windowMs as parameters', async () => {
            mockQueryRaw.mockResolvedValue([{ count: 1 }])
            const before = Date.now()

            await service.checkRateLimit('k', 5, 60000)

            const values = (
                mockQueryRaw.mock.calls[0] as unknown as [
                    string[],
                    ...unknown[],
                ]
            ).slice(1)
            const dates = values.filter((v): v is Date => v instanceof Date)
            expect(values).toContain('k')
            expect(dates.length).toBeGreaterThanOrEqual(2)
            const windowEnd = Math.max(...dates.map((d) => d.getTime()))
            expect(windowEnd).toBeGreaterThanOrEqual(before + 60000)
        })
    })

    describe('validation guards (kill type-guard mutants)', () => {
        it('checkRateLimit fails when the statement result is not an array', async () => {
            mockQueryRaw.mockResolvedValue({ count: 3 })

            const result = await service.checkRateLimit('k', 5, 60000)

            expect(result.isFailure()).toBe(true)
        })

        it('checkRateLimit fails when count is not a number', async () => {
            mockQueryRaw.mockResolvedValue([{ count: 'three' }])

            const result = await service.checkRateLimit('k', 5, 60000)

            expect(result.isFailure()).toBe(true)
        })
    })

    describe('error labels (kill operation-name StringLiteral mutants)', () => {
        it('logs the cleanup_old_data label on failure', async () => {
            mockTrackHistoryDeleteMany.mockRejectedValue(new Error('boom'))
            mockRateLimitDeleteMany.mockResolvedValue({ count: 0 })

            await service.cleanupOldData()

            expect(jest.mocked(errorLog)).toHaveBeenCalledWith(
                expect.objectContaining({ message: 'cleanup_old_data failed' }),
            )
        })

        it('logs the check_rate_limit label on failure', async () => {
            mockRateLimitFindUnique.mockRejectedValue(new Error('boom'))

            await service.checkRateLimit('k', 5, 60000)

            expect(jest.mocked(errorLog)).toHaveBeenCalledWith(
                expect.objectContaining({ message: 'check_rate_limit failed' }),
            )
        })
    })
})
