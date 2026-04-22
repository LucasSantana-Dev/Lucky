import type { Express, Request, Response } from 'express'
import { timingSafeEqual } from 'node:crypto'
import Redis from 'ioredis'
import { writeLimiter } from '../middleware/rateLimit'
import { asyncHandler } from '../middleware/asyncHandler'
import { AppError } from '../errors/AppError'
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth'
import { debugLog, errorLog } from '@lucky/shared/utils'
import {
    TOP_GG_VOTE_TIERS,
    TOP_GG_VOTE_URL,
    tierForVoteStreak,
} from '@lucky/shared/constants'

// Vote window: top.gg allows one upvote every 12 hours.
const VOTE_TTL_SECONDS = 60 * 60 * 12

// Streak window: 36h gives 12h grace around the 24h cycle so a daily voter
// doesn't lose their streak due to timezone or minor scheduling drift.
const STREAK_TTL_SECONDS = 60 * 60 * 36

const RECORD_VOTE_SCRIPT = `
if redis.call('EXISTS', KEYS[1]) == 1 then
  return 0
end
redis.call('INCR', KEYS[2])
redis.call('EXPIRE', KEYS[2], tonumber(ARGV[3]))
redis.call('SET', KEYS[1], ARGV[1], 'EX', tonumber(ARGV[2]))
return 1
`

let redisClient: Redis | null = null

function getRedis(): Redis {
    if (redisClient) return redisClient
    const host = process.env.REDIS_HOST
    if (!host) {
        throw AppError.serviceUnavailable('REDIS_HOST is not configured')
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
        errorLog({
            message: 'webhooks redis error',
            data: { error: String(err) },
        })
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

function isDiscordSnowflake(value: string): boolean {
    return /^\d{17,20}$/.test(value)
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
    const replies = (await redis
        .pipeline()
        .get(voteKey)
        .get(streakKey)
        .ttl(voteKey)
        .exec()) as
        | [
              [Error | null, string | null],
              [Error | null, string | null],
              [Error | null, number],
          ]
        | null

    if (!replies) {
        throw new AppError(500, 'failed to read vote state')
    }

    const [voteResult, streakResult, ttlResult] = replies
    const commandError =
        voteResult[0] ?? streakResult[0] ?? ttlResult[0] ?? null
    if (commandError) {
        errorLog({
            message: 'vote state redis read failed',
            data: { voteKey, streakKey, error: String(commandError) },
        })
        throw new AppError(500, 'failed to read vote state')
    }

    const voteTs = voteResult[1]
    const streakRaw = streakResult[1]
    const ttl = ttlResult[1]
    return {
        hasVoted: voteTs !== null,
        streak: streakRaw ? Number(streakRaw) : 0,
        nextVoteInSeconds: ttl > 0 ? ttl : 0,
    }
}

async function recordVote(
    redis: Redis,
    voteKey: string,
    streakKey: string,
): Promise<'recorded' | 'duplicate'> {
    const result = await redis.eval(
        RECORD_VOTE_SCRIPT,
        2,
        voteKey,
        streakKey,
        Date.now().toString(),
        String(VOTE_TTL_SECONDS),
        String(STREAK_TTL_SECONDS),
    )
    if (result === 1 || result === '1') return 'recorded'
    if (result === 0 || result === '0') return 'duplicate'
    throw new AppError(500, 'unexpected vote record result')
}

function validateVoteUserId(userId: unknown): string {
    if (typeof userId !== 'string' || !isDiscordSnowflake(userId)) {
        throw AppError.badRequest('user id missing or invalid')
    }
    return userId
}

function validateRouteUserId(userId: unknown): string {
    if (typeof userId !== 'string' || !isDiscordSnowflake(userId)) {
        throw AppError.badRequest('invalid userId')
    }
    return userId
}

export function setupWebhookApiRoutes(app: Express): void {
    app.get(
        '/api/internal/votes/:userId',
        asyncHandler(async (req: Request, res: Response) => {
            verifyInternalKey(req)
            const userId = validateRouteUserId(req.params.userId)
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
            const tier = tierForVoteStreak(state.streak)
            const nextTier = [...TOP_GG_VOTE_TIERS]
                .reverse()
                .find((t) => t.threshold > state.streak)
            res.status(200).json({
                ...state,
                tier: tier
                    ? { label: tier.label, threshold: tier.threshold }
                    : null,
                nextTier: nextTier
                    ? { label: nextTier.label, threshold: nextTier.threshold }
                    : null,
                voteUrl: TOP_GG_VOTE_URL,
            })
        }),
    )
}

export function setupWebhookPublicRoutes(app: Express): void {
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

            const userId = validateVoteUserId(payload.user)

            const redis = getRedis()
            const voteKey = `votes:${userId}`
            const streakKey = `votes:streak:${userId}`

            try {
                const recordResult = await recordVote(redis, voteKey, streakKey)

                if (recordResult === 'duplicate') {
                    debugLog({
                        message:
                            'top.gg vote already recorded — skipping streak increment',
                        data: { userId },
                    })
                    res.status(200).json({ ok: true, duplicate: true })
                    return
                }

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

export function setupWebhookRoutes(app: Express): void {
    setupWebhookApiRoutes(app)
    setupWebhookPublicRoutes(app)
}
