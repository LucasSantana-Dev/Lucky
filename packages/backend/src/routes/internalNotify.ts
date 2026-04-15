import type { Express, Request, Response } from 'express'
import { writeLimiter } from '../middleware/rateLimit'
import { asyncHandler } from '../middleware/asyncHandler'
import { AppError } from '../errors/AppError'
import { errorLog } from '@lucky/shared/utils'

const DISCORD_API = 'https://discord.com/api/v10'

function requireKey(req: Request): void {
    const provided = req.header('x-notify-key')
    const expected = process.env.LUCKY_NOTIFY_API_KEY
    if (!expected || !provided || provided !== expected) {
        throw AppError.unauthorized('invalid notify key')
    }
}

type NotifyBody = {
    channelId?: string
    content?: string
    embeds?: unknown[]
}

export function setupInternalNotifyRoutes(app: Express): void {
    app.post(
        '/api/internal/notify',
        writeLimiter,
        asyncHandler(async (req: Request, res: Response) => {
            requireKey(req)
            const body = (req.body ?? {}) as NotifyBody
            if (!body.channelId || (!body.content && !body.embeds)) {
                throw AppError.badRequest(
                    'channelId + content|embeds required',
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
                },
            )

            if (!resp.ok) {
                const text = await resp.text().catch(() => '')
                errorLog({
                    message: 'internal notify failed',
                    data: { status: resp.status, text },
                })
                throw new AppError(502, `discord ${resp.status}`)
            }

            res.status(204).send()
        }),
    )
}
