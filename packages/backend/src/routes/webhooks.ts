import type { Express, Request, Response } from 'express'
import { timingSafeEqual } from 'node:crypto'
import { writeLimiter } from '../middleware/rateLimit'
import { asyncHandler } from '../middleware/asyncHandler'
import { AppError } from '../errors/AppError'
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth'
import { debugLog, errorLog, getPrismaClient } from '@lucky/shared/utils'
import {
    TOP_GG_VOTE_TIERS,
    TOP_GG_VOTE_URL,
    tierForVoteStreak,
} from '@lucky/shared/constants'

// Vote window: top.gg allows one upvote every 12 hours.
const VOTE_TTL_MILLISECONDS = 60 * 60 * 12 * 1000

// Streak window: 36h gives 12h grace around the 24h cycle so a daily voter
// doesn't lose their streak due to timezone or minor scheduling drift.
const STREAK_TTL_MILLISECONDS = 60 * 60 * 36 * 1000

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
    const provided = req.header('authorization')?.trim()
    if (!provided || !safeEqualString(provided, expected)) {
        throw AppError.unauthorized('invalid top.gg webhook token')
    }
}

function verifyInternalKey(req: Request): void {
    const expected = process.env.LUCKY_NOTIFY_API_KEY
    const provided = req.header('x-notify-key')?.trim()
    if (!expected || !provided || !safeEqualString(provided, expected)) {
        throw AppError.unauthorized('invalid internal key')
    }
}

async function readVoteState(
    userId: string,
): Promise<{ hasVoted: boolean; streak: number; nextVoteInSeconds: number }> {
    const prisma = getPrismaClient()
    const vote = await prisma.topggVote.findUnique({
        where: { userId },
    })

    if (!vote) {
        return {
            hasVoted: false,
            streak: 0,
            nextVoteInSeconds: 0,
        }
    }

    const now = Date.now()
    const timeSinceVote = now - vote.lastVoteAt.getTime()
    const nextVoteInMilliseconds = Math.max(
        0,
        VOTE_TTL_MILLISECONDS - timeSinceVote,
    )

    return {
        hasVoted: timeSinceVote < VOTE_TTL_MILLISECONDS,
        streak: vote.streak,
        nextVoteInSeconds: Math.ceil(nextVoteInMilliseconds / 1000),
    }
}

async function recordVote(userId: string): Promise<'recorded' | 'duplicate'> {
    const prisma = getPrismaClient()
    const now = new Date()
    const nowMs = now.getTime()

    return await prisma.$transaction(async (tx) => {
        // Check for existing vote record
        const existing = await tx.topggVote.findUnique({
            where: { userId },
        })

        // Duplicate check: vote exists and is within 12h TTL
        if (existing) {
            const timeSinceVote = nowMs - existing.lastVoteAt.getTime()
            if (timeSinceVote < VOTE_TTL_MILLISECONDS) {
                return 'duplicate'
            }
        }

        // Accept: compute new streak
        let newStreak = 1
        if (existing) {
            const timeSinceVote = nowMs - existing.lastVoteAt.getTime()
            // Preserve streak if within 36h, otherwise reset to 1
            newStreak = timeSinceVote <= STREAK_TTL_MILLISECONDS
                ? existing.streak + 1
                : 1
        }

        // Upsert: create or update vote record
        await tx.topggVote.upsert({
            where: { userId },
            create: {
                userId,
                lastVoteAt: now,
                streak: newStreak,
            },
            update: {
                lastVoteAt: now,
                streak: newStreak,
            },
        })

        return 'recorded'
    })
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
            const state = await readVoteState(userId)
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
            const state = await readVoteState(userId)
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

            try {
                const recordResult = await recordVote(userId)

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
