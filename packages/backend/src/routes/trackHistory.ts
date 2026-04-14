import type { Express, Response } from 'express'
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth'
import { validateParams, validateQuery } from '../middleware/validate'
import { writeLimiter } from '../middleware/rateLimit'
import { asyncHandler } from '../middleware/asyncHandler'
import { managementSchemas as s } from '../schemas/management'
import { trackHistoryService } from '@lucky/shared/services'
import { z } from 'zod'

function p(val: string | string[]): string {
    return typeof val === 'string' ? val : val[0]
}

const historyQuery = z.object({
    limit: z.coerce.number().int().min(1).max(100).optional(),
    offset: z.coerce.number().int().min(0).optional(),
})

const topQuery = z.object({
    limit: z.coerce.number().int().min(1).max(50).optional(),
})

export function setupTrackHistoryRoutes(app: Express): void {
    app.get(
        '/api/guilds/:guildId/music/history',
        requireAuth,
        validateParams(s.guildIdParam),
        validateQuery(historyQuery),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const limit = Number(req.query.limit) || 10
            const offset = Number(req.query.offset) || 0
            const history = await trackHistoryService.getTrackHistory(
                guildId,
                limit,
                offset,
            )
            const total =
                await trackHistoryService.getTrackHistoryCount(guildId)
            res.json({ history, total })
        }),
    )

    app.get(
        '/api/guilds/:guildId/music/history/stats',
        requireAuth,
        validateParams(s.guildIdParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const stats = await trackHistoryService.generateStats(guildId)
            res.json({ stats })
        }),
    )

    app.get(
        '/api/guilds/:guildId/music/history/top-tracks',
        requireAuth,
        validateParams(s.guildIdParam),
        validateQuery(topQuery),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const limit = Number(req.query.limit) || 10
            const tracks = await trackHistoryService.getTopTracks(
                guildId,
                limit,
            )
            res.json({ tracks })
        }),
    )

    app.get(
        '/api/guilds/:guildId/music/history/top-artists',
        requireAuth,
        validateParams(s.guildIdParam),
        validateQuery(topQuery),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const limit = Number(req.query.limit) || 10
            const artists = await trackHistoryService.getTopArtists(
                guildId,
                limit,
            )
            res.json({ artists })
        }),
    )

    app.delete(
        '/api/guilds/:guildId/music/history',
        requireAuth,
        writeLimiter,
        validateParams(s.guildIdParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            await trackHistoryService.clearHistory(guildId)
            res.json({ success: true })
        }),
    )
}
