/**
 * Database service for managing PostgreSQL operations
 */

import { randomUUID } from 'node:crypto'
import { getPrismaClient } from '../../utils/database/prismaClient'
import type { PrismaClient } from '../../generated/prisma/client.js'
import { Result } from '../../types/common/BaseResult'
import { errorLog } from '../../utils/general/log'

/** Rate limiting and data retention on top of the shared Prisma client. */
export class DatabaseService {
    private readonly prisma: PrismaClient

    constructor() {
        this.prisma = getPrismaClient()
    }

    private async executeWithFallback<T>(
        operation: () => Promise<T>,
        operationName: string,
    ): Promise<Result<T>> {
        try {
            const result = await operation()
            return Result.success(result)
        } catch (error) {
            errorLog({ message: `${operationName} failed`, error })
            return Result.failure(
                error instanceof Error
                    ? error
                    : new Error('Database operation failed'),
            )
        }
    }

    /** Checks whether the given key is within the allowed rate limit window. */
    async checkRateLimit(
        key: string,
        limit: number,
        windowMs: number,
    ): Promise<Result<boolean>> {
        return this.executeWithFallback(async () => {
            const now = new Date()
            const resetAt = new Date(now.getTime() + windowMs)

            // Single atomic statement: concurrent callers serialize on the
            // row lock, so check and increment cannot interleave.
            const rows: unknown = await this.prisma.$queryRaw`
                INSERT INTO "rate_limits" ("id", "key", "count", "resetAt")
                VALUES (${randomUUID()}, ${key}, 1, ${resetAt})
                ON CONFLICT ("key") DO UPDATE SET
                    "count" = CASE
                        WHEN "rate_limits"."resetAt" < ${now}
                        THEN 1
                        ELSE "rate_limits"."count" + 1
                    END,
                    "resetAt" = CASE
                        WHEN "rate_limits"."resetAt" < ${now}
                        THEN ${resetAt}
                        ELSE "rate_limits"."resetAt"
                    END
                RETURNING "count"
            `
            const count = Array.isArray(rows)
                ? (rows[0] as { count?: unknown } | undefined)?.count
                : undefined
            if (typeof count !== 'number') {
                throw new Error('Invalid rate limit result')
            }
            return count <= limit
        }, 'check_rate_limit')
    }

    /** Deletes track history, expired rate limit records, and server logs older than 30 days,
     * user feedback (#2477), command events (#2391) and activation events older than their own 180-day window. */
    async cleanupOldData(): Promise<Result<number>> {
        return this.executeWithFallback(async () => {
            const thirtyDaysAgo = new Date(
                Date.now() - 30 * 24 * 60 * 60 * 1000,
            )
            const oneHundredEightyDaysAgo = new Date(
                Date.now() - 180 * 24 * 60 * 60 * 1000,
            )

            const [
                tracks,
                rateLimits,
                serverLogs,
                userFeedback,
                commandEvents,
                activationEvents,
            ] = await Promise.all([
                this.prisma.trackHistory.deleteMany({
                    where: { playedAt: { lt: thirtyDaysAgo } },
                }),
                this.prisma.rateLimit.deleteMany({
                    where: { resetAt: { lt: new Date() } },
                }),
                this.prisma.serverLog.deleteMany({
                    where: { createdAt: { lt: thirtyDaysAgo } },
                }),
                this.prisma.userFeedback.deleteMany({
                    where: { createdAt: { lt: oneHundredEightyDaysAgo } },
                }),
                this.prisma.commandEvent.deleteMany({
                    where: { occurredAt: { lt: oneHundredEightyDaysAgo } },
                }),
                this.prisma.activationEvent.deleteMany({
                    where: { occurredAt: { lt: oneHundredEightyDaysAgo } },
                }),
            ])

            return (
                tracks.count +
                rateLimits.count +
                serverLogs.count +
                userFeedback.count +
                commandEvents.count +
                activationEvents.count
            )
        }, 'cleanup_old_data')
    }
}
