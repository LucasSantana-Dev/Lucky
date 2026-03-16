import type { Express, Response } from 'express'
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth'
import { validateBody, validateParams } from '../middleware/validate'
import { writeLimiter } from '../middleware/rateLimit'
import { asyncHandler } from '../middleware/asyncHandler'
import { AppError } from '../errors/AppError'
import { z } from 'zod'
import { levelService } from '@lucky/shared/services'

function p(val: string | string[]): string {
    return typeof val === 'string' ? val : val[0]
}

const guildIdParam = z.object({ guildId: z.string().min(1) })
const userIdParam = z.object({ guildId: z.string().min(1), userId: z.string().min(1) })
const levelParam = z.object({ guildId: z.string().min(1), level: z.coerce.number().int().min(1) })

const upsertConfigBody = z.object({
    enabled: z.boolean().optional(),
    xpPerMessage: z.number().int().min(1).max(1000).optional(),
    xpCooldownMs: z.number().int().min(1000).optional(),
    announceChannel: z.string().nullable().optional(),
})

const addRewardBody = z.object({
    level: z.number().int().min(1),
    roleId: z.string().min(1),
})

export function setupLevelsRoutes(app: Express): void {
    app.get(
        '/api/guilds/:guildId/levels/config',
        requireAuth,
        validateParams(guildIdParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const config = await levelService.getConfig(guildId)
            res.json({ config })
        }),
    )

    app.patch(
        '/api/guilds/:guildId/levels/config',
        requireAuth,
        writeLimiter,
        validateParams(guildIdParam),
        validateBody(upsertConfigBody),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const data = upsertConfigBody.parse(req.body)
            const config = await levelService.upsertConfig(guildId, data)
            res.json({ config })
        }),
    )

    app.get(
        '/api/guilds/:guildId/levels/leaderboard',
        requireAuth,
        validateParams(guildIdParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const limit = Number(req.query.limit) || 10
            const leaderboard = await levelService.getLeaderboard(guildId, Math.min(limit, 50))
            res.json({ leaderboard })
        }),
    )

    app.get(
        '/api/guilds/:guildId/levels/rank/:userId',
        requireAuth,
        validateParams(userIdParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const userId = p(req.params.userId)
            const [memberXp, rank] = await Promise.all([
                levelService.getMemberXP(guildId, userId),
                levelService.getRank(guildId, userId),
            ])
            if (!memberXp) throw AppError.notFound('Member XP not found')
            res.json({ memberXp, rank })
        }),
    )

    app.get(
        '/api/guilds/:guildId/levels/rewards',
        requireAuth,
        validateParams(guildIdParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const rewards = await levelService.getRewards(guildId)
            res.json({ rewards })
        }),
    )

    app.post(
        '/api/guilds/:guildId/levels/rewards',
        requireAuth,
        writeLimiter,
        validateParams(guildIdParam),
        validateBody(addRewardBody),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const { level, roleId } = addRewardBody.parse(req.body)
            const reward = await levelService.addReward(guildId, level, roleId)
            res.status(201).json({ reward })
        }),
    )

    app.delete(
        '/api/guilds/:guildId/levels/rewards/:level',
        requireAuth,
        writeLimiter,
        validateParams(levelParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const level = Number(req.params.level)
            await levelService.removeReward(guildId, level)
            res.json({ success: true })
        }),
    )
}
