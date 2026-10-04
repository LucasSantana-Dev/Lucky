import type { Express, Response } from 'express'
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth'
import { requireGuildModuleAccess } from '../middleware/guildAccess'
import { validateParams, validateQuery } from '../middleware/validate'
import { writeLimiter } from '../middleware/rateLimit'
import { asyncHandler } from '../middleware/asyncHandler'
import { managementSchemas as s } from '../schemas/management'
import { trackHistoryService } from '@lucky/shared/services'
import { z } from 'zod'
import { AppError } from '../errors/AppError'
import { paramToString as p } from '../utils/paramCoerce'

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
        requireGuildModuleAccess('music', 'view'),
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
        requireGuildModuleAccess('music', 'view'),
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
        requireGuildModuleAccess('music', 'view'),
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
        requireGuildModuleAccess('music', 'view'),
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
        requireGuildModuleAccess('music', 'manage'),
        writeLimiter,
        validateParams(s.guildIdParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const cleared = await trackHistoryService.clearHistory(guildId)
            if (!cleared) {
                throw new AppError(500, 'Failed to clear music history')
            }
            res.json({ success: true })
        }),
    )
}
