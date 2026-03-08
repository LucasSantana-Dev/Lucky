import type { Express, Response } from 'express'
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth'
import { validateBody, validateParams } from '../middleware/validate'
import { writeLimiter } from '../middleware/rateLimit'
import { asyncHandler } from '../middleware/asyncHandler'
import { managementSchemas as s } from '../schemas/management'
import { twitchNotificationService } from '@nexus/shared/services'
import { z } from 'zod'

function p(val: string | string[]): string {
    return typeof val === 'string' ? val : val[0]
}

const addTwitchBody = z
    .object({
        twitchUserId: z.string().min(1).max(50),
        twitchLogin: z.string().min(1).max(50),
        discordChannelId: z.string().regex(/^\d{17,20}$/),
    })
    .strict()

const removeTwitchBody = z
    .object({
        twitchUserId: z.string().min(1).max(50),
    })
    .strict()

export function setupTwitchRoutes(app: Express): void {
    app.get(
        '/api/guilds/:guildId/twitch/notifications',
        requireAuth,
        validateParams(s.guildIdParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const notifications =
                await twitchNotificationService.listByGuild(guildId)
            res.json({ notifications })
        }),
    )

    app.post(
        '/api/guilds/:guildId/twitch/notifications',
        requireAuth,
        writeLimiter,
        validateParams(s.guildIdParam),
        validateBody(addTwitchBody),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const { twitchUserId, twitchLogin, discordChannelId } = req.body
            const success = await twitchNotificationService.add(
                guildId,
                discordChannelId,
                twitchUserId,
                twitchLogin,
            )
            res.json({ success })
        }),
    )

    app.delete(
        '/api/guilds/:guildId/twitch/notifications',
        requireAuth,
        writeLimiter,
        validateParams(s.guildIdParam),
        validateBody(removeTwitchBody),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const { twitchUserId } = req.body
            const success = await twitchNotificationService.remove(
                guildId,
                twitchUserId,
            )
            res.json({ success })
        }),
    )
}
