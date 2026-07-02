import type { Express, Request, Response } from 'express'
import { writeLimiter } from '../middleware/rateLimit'
import { asyncHandler } from '../middleware/asyncHandler'
import { AppError } from '../errors/AppError'
import { errorLog } from '@lucky/shared/utils'
import { timingSafeKeyCompare } from '../utils/timingSafeKeyCompare'

const DISCORD_API = 'https://discord.com/api/v10'

function requireAnnounceKey(req: Request): void {
    const provided = req.header('x-announce-key')?.trim()
    const expected = process.env.LUCKY_ANNOUNCE_API_KEY
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
            if (!body.channelId || (!body.content && !body.embeds)) {
                throw AppError.badRequest('channelId + content|embeds required')
            }

            if (!allowlist.has(body.channelId)) {
                throw AppError.forbidden(
                    `channel ${body.channelId} not in allowlist`,
                )
            }

            const token = process.env.DISCORD_TOKEN
            if (!token) {
                throw new AppError(500, 'bot token missing')
            }

            const resp = await fetch(
                `${DISCORD_API}/channels/${body.channelId}/messages`,
                {
                    method: 'POST',
                    headers: {
                        Authorization: `Bot ${token}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        content: body.content?.slice(0, 1900),
                        embeds: body.embeds,
                    }),
                    signal: AbortSignal.timeout(10_000),
                },
            )

            if (!resp.ok) {
                const text = await resp.text().catch(() => '')
                errorLog({
                    message: 'service announce failed',
                    data: { status: resp.status, text },
                })
                throw new AppError(502, `discord ${resp.status}`)
            }

            res.status(204).send()
        }),
    )
}
