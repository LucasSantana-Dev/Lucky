import type { Express, Request, Response } from 'express'
import Redis from 'ioredis'
import { writeLimiter } from '../middleware/rateLimit'
import { asyncHandler } from '../middleware/asyncHandler'
import { AppError } from '../errors/AppError'
import { debugLog, errorLog } from '@lucky/shared/utils'

// Vote window: top.gg allows one upvote every 12 hours.
const VOTE_TTL_SECONDS = 60 * 60 * 12

// Streak window: 36h gives 12h grace around the 24h cycle so a daily voter
// doesn't lose their streak due to timezone or minor scheduling drift.
const STREAK_TTL_SECONDS = 60 * 60 * 36

let redisClient: Redis | null = null

function getRedis(): Redis {
    if (redisClient) return redisClient
    const host = process.env.REDIS_HOST
    if (!host) {
        throw new AppError(500, 'REDIS_HOST is not configured')
    }
    redisClient = new Redis({
        host,
        port: Number(process.env.REDIS_PORT ?? 6379),
        password: process.env.REDIS_PASSWORD || undefined,
        lazyConnect: true,
        maxRetriesPerRequest: 1,
    })
    return redisClient
}

type TopggVotePayload = {
    bot?: string
    user?: string
    type?: 'upvote' | 'test'
    isWeekend?: boolean
    query?: string
}

function verifyTopggAuth(req: Request): void {
    const expected = process.env.TOPGG_AUTH_TOKEN
    if (!expected) {
        throw new AppError(503, 'TOPGG_AUTH_TOKEN not configured')
    }
    const provided = req.header('authorization')
    if (!provided || provided !== expected) {
        throw AppError.unauthorized('invalid top.gg webhook token')
    }
}

export function setupWebhookRoutes(app: Express): void {
    app.post(
        '/webhooks/topgg-votes',
        writeLimiter,
        asyncHandler(async (req: Request, res: Response) => {
            verifyTopggAuth(req)

            const payload = (req.body ?? {}) as TopggVotePayload

            if (payload.type === 'test') {
                debugLog({ message: 'top.gg webhook test received' })
                res.status(200).json({ ok: true, test: true })
                return
            }

            const userId = payload.user
            if (!userId || typeof userId !== 'string') {
                throw AppError.badRequest('user id missing or invalid')
            }

            const redis = getRedis()
            const voteKey = `votes:${userId}`
            const streakKey = `votes:streak:${userId}`

            try {
                const pipeline = redis.pipeline()
                pipeline.set(voteKey, Date.now().toString(), 'EX', VOTE_TTL_SECONDS)
                pipeline.incr(streakKey)
                pipeline.expire(streakKey, STREAK_TTL_SECONDS)
                await pipeline.exec()

                debugLog({
                    message: 'top.gg vote recorded',
                    data: {
                        userId,
                        isWeekend: payload.isWeekend === true,
                    },
                })
                res.status(200).json({ ok: true })
            } catch (error) {
                errorLog({
                    message: 'top.gg vote persist failed',
                    data: { userId, error: String(error) },
                })
                throw new AppError(500, 'failed to record vote')
            }
        }),
    )
}
