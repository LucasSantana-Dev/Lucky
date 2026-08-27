import type { Express, Request, Response } from 'express'
import { timingSafeKeyCompare } from '../utils/timingSafeKeyCompare'
import {
    verifyTopggSignature,
    TOPGG_WEBHOOK_PATH,
} from '../utils/topggSignature'
import { writeLimiter } from '../middleware/rateLimit'
import { asyncHandler } from '../middleware/asyncHandler'
import { AppError } from '../errors/AppError'
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth'
import {
    debugLog,
    errorLog,
    warnLog,
    getPrismaClient,
} from '@lucky/shared/utils'
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

/**
 * top.gg changed the BODY as well as the auth scheme, and the two are
 * independent. #2103 implemented v1 signature verification while leaving the v0
 * payload reader in place, so the first real delivery was rejected with
 * `400 unsupported vote type`.
 *
 * v0: { user: '<discord id>', type: 'upvote' | 'test', isWeekend: bool }
 * v1: { type: 'vote.create' | 'webhook.test',
 *       data: { user: { id, platform_id }, weight } }
 *
 * The trap is `data.user`. `id` is top.gg's OWN user id; the Discord snowflake
 * is `platform_id`. Reading `id` would credit votes to a different user, and
 * only the snowflake check downstream would catch it -- and only by luck, if
 * the top.gg id happened not to look like a snowflake.
 *
 * Weekend double votes moved too: v0 said `isWeekend`, v1 says `weight: 2`.
 */
type TopggV0Payload = {
    bot?: string
    user?: string
    type?: 'upvote' | 'test'
    isWeekend?: boolean
    query?: string
}

type TopggV1Payload = {
    type?: 'vote.create' | 'webhook.test'
    data?: {
        weight?: number
        user?: { id?: string; platform_id?: string }
    }
}

type NormalizedVote =
    | { kind: 'test' }
    | { kind: 'vote'; userId: unknown; isWeekend: boolean }
    | { kind: 'unsupported'; type: unknown }

/**
 * One place that understands both wire formats, so the handler below never has
 * to care which one arrived.
 */
export function normalizeTopggPayload(body: unknown): NormalizedVote {
    // Read the wire shape structurally rather than as `V0 & V1`: intersecting
    // the two literal unions collapses `type` to `undefined` and every case
    // below becomes uncomparable. The named types above stay as the record of
    // what each format looks like.
    const payload = (body ?? {}) as {
        type?: string
        user?: unknown
        isWeekend?: unknown
        data?: { weight?: unknown; user?: { platform_id?: unknown } }
    }

    switch (payload.type) {
        case 'webhook.test':
        case 'test':
            return { kind: 'test' }
        case 'vote.create':
            return {
                kind: 'vote',
                // platform_id, NOT id — see the note above.
                userId: payload.data?.user?.platform_id,
                isWeekend: Number(payload.data?.weight ?? 1) >= 2,
            }
        case 'upvote':
            return {
                kind: 'vote',
                userId: payload.user,
                isWeekend: payload.isWeekend === true,
            }
        default:
            return { kind: 'unsupported', type: payload.type }
    }
}

function isDiscordSnowflake(value: string): boolean {
    return /^\d{17,20}$/.test(value)
}

/**
 * top.gg has two webhook auth models, and the SERVER picks which one is active.
 *
 * v1 (anything created today): top.gg generates a `whs_`-prefixed secret and
 * signs each delivery, sending `x-topgg-signature`. Configure
 * TOPGG_WEBHOOK_SECRET.
 *
 * v0 (legacy): the owner picks a shared secret which top.gg echoes verbatim in
 * the `Authorization` header. Configure TOPGG_AUTH_TOKEN.
 *
 * The choice is made by which env var is set, NEVER by the request. An earlier
 * version branched on whether `x-topgg-signature` was present, which let the
 * caller select the scheme: with both configured, omitting the header dropped
 * verification from an HMAC over the body to a plaintext token comparison. That
 * is an auth downgrade, and the fact that v0 still needs the shared secret does
 * not save it, because a v0 token travels in cleartext on every delivery and so
 * is far more exposed than a signing key that never leaves the server.
 *
 * So: TOPGG_WEBHOOK_SECRET present means v1 only. v0 is reachable only when no
 * v1 secret is configured at all, which is also what allows the v1 secret to be
 * deployed before the webhook exists on top.gg.
 */
function verifyTopggAuth(req: Request): void {
    const webhookSecret = process.env.TOPGG_WEBHOOK_SECRET
    const legacyToken = process.env.TOPGG_AUTH_TOKEN

    if (webhookSecret) {
        const result = verifyTopggSignature({
            header: req.header('x-topgg-signature')?.trim(),
            rawBody: (req as Request & { rawBody?: Buffer }).rawBody,
            secret: webhookSecret,
        })
        if (!result.ok) {
            // Logged, never returned: telling a caller whether a signature was
            // stale, absent, or simply wrong is a probing aid.
            debugLog({
                message: 'top.gg v1 signature rejected',
                data: { reason: result.reason },
            })
            throw AppError.unauthorized('invalid top.gg webhook signature')
        }
        return
    }

    if (!legacyToken) {
        throw new AppError(503, 'TOPGG_AUTH_TOKEN not configured')
    }
    const provided = req.header('authorization')?.trim()
    if (!provided || !timingSafeKeyCompare(provided, legacyToken)) {
        throw AppError.unauthorized('invalid top.gg webhook token')
    }
}

function verifyInternalKey(req: Request): void {
    const expected = process.env.LUCKY_NOTIFY_API_KEY
    const provided = req.header('x-notify-key')?.trim()
    if (!expected || !provided || !timingSafeKeyCompare(provided, expected)) {
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

    // Streak expires after 36h with no vote, matching the original Redis EXPIRE behavior
    const expiredStreak =
        timeSinceVote > STREAK_TTL_MILLISECONDS ? 0 : vote.streak

    return {
        hasVoted: timeSinceVote < VOTE_TTL_MILLISECONDS,
        streak: expiredStreak,
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
            newStreak =
                timeSinceVote <= STREAK_TTL_MILLISECONDS
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
        TOPGG_WEBHOOK_PATH,
        writeLimiter,
        asyncHandler(async (req: Request, res: Response) => {
            verifyTopggAuth(req)

            const event = normalizeTopggPayload(req.body)

            if (event.kind === 'test') {
                debugLog({ message: 'top.gg webhook test received' })
                res.status(200).json({ ok: true, test: true })
                return
            }

            // Only persist genuine votes. Unknown/future event types must not
            // bump the streak counter. The rejected type is logged because the
            // first v1 delivery failed here and the log said only "400" -- a
            // rejection that does not name what it rejected cannot be
            // diagnosed from the outside.
            if (event.kind === 'unsupported') {
                warnLog({
                    message: 'top.gg webhook: unsupported event type',
                    data: { type: String(event.type) },
                })
                throw AppError.badRequest('unsupported vote type')
            }

            const userId = validateVoteUserId(event.userId)

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
                        isWeekend: event.isWeekend,
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
