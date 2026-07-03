import type { Express, Request, Response } from 'express'
import { writeLimiter } from '../middleware/rateLimit'
import { asyncHandler } from '../middleware/asyncHandler'
import { AppError } from '../errors/AppError'
import { timingSafeKeyCompare } from '../utils/timingSafeKeyCompare'
import {
    postChannelMessage,
    type ChannelMessagePayload,
} from '../utils/postChannelMessage'

function requireKey(req: Request): void {
    const provided = req.header('x-notify-key')?.trim()
    const expected = process.env.LUCKY_NOTIFY_API_KEY?.trim()
    if (!timingSafeKeyCompare(provided, expected)) {
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
            const payload: ChannelMessagePayload = {
                channelId: body.channelId || '',
                content: body.content,
                embeds: body.embeds,
            }
            await postChannelMessage(payload, 'internal notify failed')
            res.status(204).send()
        }),
    )
}
