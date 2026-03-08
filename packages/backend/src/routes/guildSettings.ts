import type { Express, Response } from 'express'
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth'
import { validateBody, validateParams } from '../middleware/validate'
import { writeLimiter } from '../middleware/rateLimit'
import { asyncHandler } from '../middleware/asyncHandler'
import { managementSchemas as s } from '../schemas/management'
import { guildSettingsService } from '@nexus/shared/services'
import { z } from 'zod'

function p(val: string | string[]): string {
    return typeof val === 'string' ? val : val[0]
}

const settingsBody = z
    .object({
        nickname: z.string().max(32).optional(),
        commandPrefix: z.string().max(5).optional(),
        managerRoles: z.array(z.string()).optional(),
        updatesChannel: z.string().optional(),
        timezone: z.string().max(50).optional(),
        disableWarnings: z.boolean().optional(),
    })
    .strict()

const moduleSlugParam = s.guildIdParam.extend({
    slug: z.string().min(1).max(50),
})

const moduleSettingsBody = z.record(z.string(), z.unknown())

export function setupGuildSettingsRoutes(app: Express): void {
    app.get(
        '/api/guilds/:guildId/settings',
        requireAuth,
        validateParams(s.guildIdParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const settings =
                await guildSettingsService.getGuildSettings(guildId)
            res.json({
                settings: settings || {
                    nickname: '',
                    commandPrefix: '/',
                    managerRoles: [],
                    updatesChannel: '',
                    timezone: 'UTC',
                    disableWarnings: false,
                },
            })
        }),
    )

    app.post(
        '/api/guilds/:guildId/settings',
        requireAuth,
        writeLimiter,
        validateParams(s.guildIdParam),
        validateBody(settingsBody),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            await guildSettingsService.setGuildSettings(guildId, req.body)
            res.json({ success: true })
        }),
    )

    app.get(
        '/api/guilds/:guildId/modules/:slug/settings',
        requireAuth,
        validateParams(moduleSlugParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const settings =
                await guildSettingsService.getGuildSettings(guildId)
            res.json({ settings: settings || {} })
        }),
    )

    app.post(
        '/api/guilds/:guildId/modules/:slug/settings',
        requireAuth,
        writeLimiter,
        validateParams(moduleSlugParam),
        validateBody(moduleSettingsBody),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            await guildSettingsService.setGuildSettings(guildId, req.body)
            res.json({ success: true })
        }),
    )
}
