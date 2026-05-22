import type { Express, Response } from 'express'
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth'
import { validateParams, validateQuery } from '../middleware/validate'
import { asyncHandler } from '../middleware/asyncHandler'
import { managementSchemas as s } from '../schemas/management'
import { getPerSourceAcceptance, getSummary } from '@lucky/shared/services'
import { z } from 'zod'

function p(val: string | string[]): string {
    return typeof val === 'string' ? val : val[0]
}

const historyQuery = z.object({
    days: z.coerce.number().int().min(1).max(30).optional(),
})

export function setupRecommendationsRoutes(app: Express): void {
    app.get(
        '/api/guilds/:guildId/recommendations/history',
        requireAuth,
        validateParams(s.guildIdParam),
        validateQuery(historyQuery),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const days = req.query.days ? Number(req.query.days) : undefined

            const [summary, perSource] = await Promise.all([
                getSummary(guildId, days),
                getPerSourceAcceptance(guildId, days),
            ])

            res.json({ summary, perSource })
        }),
    )
}
