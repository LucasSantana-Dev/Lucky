import type { Express, Request, Response } from 'express'
import { writeLimiter } from '../middleware/rateLimit'
import { asyncHandler } from '../middleware/asyncHandler'
import { AppError } from '../errors/AppError'
import { timingSafeKeyCompare } from '../utils/timingSafeKeyCompare'
import {
    postChannelMessage,
    type ChannelMessagePayload,
} from '../utils/postChannelMessage'

function requireAnnounceKey(req: Request): void {
    const provided = req.header('x-announce-key')?.trim()
    const expected = process.env.LUCKY_ANNOUNCE_API_KEY?.trim()
    if (!timingSafeKeyCompare(provided, expected)) {
        throw AppError.unauthorized('invalid announce key')
    }
}

function getChannelAllowlist(): Set<string> {
    const allowlistEnv = process.env.LUCKY_ANNOUNCE_CHANNEL_IDS
    if (!allowlistEnv || !allowlistEnv.trim()) {
        return new Set()
    }
    return new Set(
        allowlistEnv
            .split(',')
            .map((id) => id.trim())
            .filter(Boolean),
    )
}

type AnnounceBody = {
    channelId?: string
    content?: string
    embeds?: unknown[]
}

export function setupServiceAnnounceRoutes(app: Express): void {
    app.post(
        '/api/service/announce',
        writeLimiter,
        asyncHandler(async (req: Request, res: Response) => {
            requireAnnounceKey(req)
            const allowlist = getChannelAllowlist()
            if (allowlist.size === 0) {
                throw AppError.forbidden(
                    'announce channel allowlist not configured',
                )
            }

            const body = (req.body ?? {}) as AnnounceBody
            const hasContent =
                typeof body.content === 'string' &&
                body.content.trim().length > 0
            const hasEmbeds =
                Array.isArray(body.embeds) && body.embeds.length > 0
            if (
                typeof body.channelId !== 'string' ||
                !body.channelId ||
                (!hasContent && !hasEmbeds)
            ) {
                throw AppError.badRequest('channelId + content|embeds required')
            }

            if (!allowlist.has(body.channelId)) {
                throw AppError.forbidden(
                    `channel ${body.channelId} not in allowlist`,
                )
            }

            const payload: ChannelMessagePayload = {
                channelId: body.channelId,
                content: body.content,
                embeds: body.embeds,
            }
            await postChannelMessage(payload, 'service announce failed')
            res.status(204).send()
        }),
    )
}
