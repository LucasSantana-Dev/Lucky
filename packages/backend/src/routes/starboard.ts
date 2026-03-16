import type { Express, Response } from 'express'
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth'
import { validateBody, validateParams } from '../middleware/validate'
import { writeLimiter } from '../middleware/rateLimit'
import { asyncHandler } from '../middleware/asyncHandler'
import { z } from 'zod'
import { starboardService } from '@lucky/shared/services'

function p(val: string | string[]): string {
    return typeof val === 'string' ? val : val[0]
}

const guildIdParam = z.object({ guildId: z.string().min(1) })

const upsertConfigBody = z.object({
    channelId: z.string().min(1).optional(),
    emoji: z.string().min(1).max(10).optional(),
    threshold: z.number().int().min(1).max(100).optional(),
    selfStar: z.boolean().optional(),
})

export function setupStarboardRoutes(app: Express): void {
    app.get(
        '/api/guilds/:guildId/starboard/config',
        requireAuth,
        validateParams(guildIdParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const config = await starboardService.getConfig(guildId)
            res.json({ config })
        }),
    )

    app.patch(
        '/api/guilds/:guildId/starboard/config',
        requireAuth,
        writeLimiter,
        validateParams(guildIdParam),
        validateBody(upsertConfigBody),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const data = upsertConfigBody.parse(req.body)
            const config = await starboardService.upsertConfig(guildId, data)
            res.json({ config })
        }),
    )

    app.delete(
        '/api/guilds/:guildId/starboard/config',
        requireAuth,
        writeLimiter,
        validateParams(guildIdParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            await starboardService.deleteConfig(guildId)
            res.json({ success: true })
        }),
    )

    app.get(
        '/api/guilds/:guildId/starboard/entries',
        requireAuth,
        validateParams(guildIdParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const limit = Number(req.query.limit) || 10
            const entries = await starboardService.getTopEntries(guildId, Math.min(limit, 50))
            res.json({ entries })
        }),
    )
}
