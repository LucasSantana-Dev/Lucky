import type { Express, Request, Response } from 'express'
import { timingSafeEqual } from 'node:crypto'
import Redis from 'ioredis'
import { writeLimiter } from '../middleware/rateLimit'
import { asyncHandler } from '../middleware/asyncHandler'
import { AppError } from '../errors/AppError'
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth'
import { debugLog, errorLog } from '@lucky/shared/utils'

// Vote tier thresholds — kept in sync with the bot's /voterewards command.
const VOTE_TIERS = [
    { threshold: 30, label: 'Lucky Legend' },
    { threshold: 14, label: 'Lucky Regular' },
    { threshold: 7, label: 'Lucky Fan' },
    { threshold: 1, label: 'Lucky Supporter' },
] as const

function tierFor(streak: number): { label: string; threshold: number } | null {
    for (const t of VOTE_TIERS) {
        if (streak >= t.threshold) return t
    }
    return null
}

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
    // ioredis raises uncaughtException if no 'error' listener is attached
    // while the connection is retrying. Log and swallow — calls will error
    // per-request via maxRetriesPerRequest, so we don't need to crash.
    redisClient.on('error', (err) => {
        errorLog({ message: 'webhooks redis error', data: { error: String(err) } })
    })
    return redisClient
}

function safeEqualString(a: string, b: string): boolean {
    const ab = Buffer.from(a)
    const bb = Buffer.from(b)
    if (ab.length !== bb.length) return false
    return timingSafeEqual(ab, bb)
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
    if (!provided || !safeEqualString(provided, expected)) {
        throw AppError.unauthorized('invalid top.gg webhook token')
    }
}

function verifyInternalKey(req: Request): void {
    const expected = process.env.LUCKY_NOTIFY_API_KEY
    const provided = req.header('x-notify-key')
    if (!expected || !provided || !safeEqualString(provided, expected)) {
        throw AppError.unauthorized('invalid internal key')
    }
}

async function readVoteState(
    redis: Redis,
    userId: string,
): Promise<{ hasVoted: boolean; streak: number; nextVoteInSeconds: number }> {
    const voteKey = `votes:${userId}`
    const streakKey = `votes:streak:${userId}`
    const [[, voteTs], [, streakRaw], [, ttl]] = (await redis
        .pipeline()
        .get(voteKey)
        .get(streakKey)
        .ttl(voteKey)
        .exec()) as [
        [Error | null, string | null],
        [Error | null, string | null],
        [Error | null, number],
    ]
    return {
        hasVoted: voteTs !== null,
        streak: streakRaw ? Number(streakRaw) : 0,
        nextVoteInSeconds: ttl > 0 ? ttl : 0,
    }
}

export function setupWebhookRoutes(app: Express): void {
    app.get(
        '/api/internal/votes/:userId',
        asyncHandler(async (req: Request, res: Response) => {
            verifyInternalKey(req)
            const { userId } = req.params
            if (!userId || typeof userId !== 'string' || !/^\d+$/.test(userId)) {
                throw AppError.badRequest('invalid userId')
            }
            const state = await readVoteState(getRedis(), userId)
            res.status(200).json(state)
        }),
    )

    app.get(
        '/api/me/vote-status',
        requireAuth,
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const userId = req.user?.id
            if (!userId) {
                throw AppError.unauthorized('not authenticated')
            }
            const state = await readVoteState(getRedis(), userId)
            const tier = tierFor(state.streak)
            const nextTier = [...VOTE_TIERS]
                .reverse()
                .find((t) => t.threshold > state.streak)
            res.status(200).json({
                ...state,
                tier: tier ? { label: tier.label, threshold: tier.threshold } : null,
                nextTier: nextTier
                    ? { label: nextTier.label, threshold: nextTier.threshold }
                    : null,
                voteUrl: 'https://top.gg/bot/962198089161134131/vote',
            })
        }),
    )

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

            // Only persist genuine upvotes. Unknown/future event types
            // (e.g. downvotes, if top.gg ever adds them) must not bump the
            // streak counter.
            if (payload.type !== 'upvote') {
                throw AppError.badRequest('unsupported vote type')
            }

            const userId = payload.user
            if (!userId || typeof userId !== 'string') {
                throw AppError.badRequest('user id missing or invalid')
            }

            const redis = getRedis()
            const voteKey = `votes:${userId}`
            const streakKey = `votes:streak:${userId}`

            try {
                // Idempotency gate: top.gg retries on handler failure/timeout.
                // SET NX means only the first call within the 12h vote window
                // lands a vote; subsequent retries return 200 without touching
                // the streak counter.
                const firstWrite = await redis.set(
                    voteKey,
                    Date.now().toString(),
                    'EX',
                    VOTE_TTL_SECONDS,
                    'NX',
                )

                if (firstWrite !== 'OK') {
                    debugLog({
                        message: 'top.gg vote already recorded — skipping streak increment',
                        data: { userId },
                    })
                    res.status(200).json({ ok: true, duplicate: true })
                    return
                }

                const pipeline = redis.pipeline()
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
