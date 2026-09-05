import type { Express, Response } from 'express'
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth'
import { validateBody, validateParams } from '../middleware/validate'
import { writeLimiter } from '../middleware/rateLimit'
import { asyncHandler } from '../middleware/asyncHandler'
import { managementSchemas as s } from '../schemas/management'
import { guildSettingsService } from '@lucky/shared/services'
import { SUPPORTED_BOT_LANGUAGES } from '@lucky/shared/constants'
import { z } from 'zod'
import { paramToString as p } from '../utils/paramCoerce'

// Real `GuildSettings` columns only (prisma/schema.prisma:206-230). The
// dashboard previously posted `nickname`, `commandPrefix`, `managerRoles`,
// `updatesChannel`, `disableWarnings`, `timezone` — none of them a column
// `toPrismaData` copies, so every save was a silent no-op (#2219). Every key
// below must also appear in `GUILD_SETTINGS_EDITABLE_FIELDS`, which the unit
// test below enforces.
export const settingsBody = z
    .object({
        prefix: z.string().min(1).max(5).optional(),
        embedColor: z
            .string()
            .regex(/^0x[0-9A-Fa-f]{6}$/, 'Must be a hex color like 0x5865F2')
            .optional(),
        language: z.enum(SUPPORTED_BOT_LANGUAGES).optional(),
        allowPlaylists: z.boolean().optional(),
        allowSpotify: z.boolean().optional(),
        commandCooldown: z.number().int().min(0).max(300).optional(),
        maxQueueSize: z.number().int().min(1).max(1000).optional(),
        defaultVolume: z.number().int().min(1).max(200).optional(),
        voteSkipThreshold: z.number().int().min(1).max(100).optional(),
    })
    .strict()

const moduleSlugParam = s.guildIdParam.extend({
    slug: z.string().min(1).max(50),
})

const moduleSettingsBody = z.record(z.string(), z.unknown())

const DEFAULT_GUILD_SETTINGS = {
    prefix: '/',
    embedColor: '0x5865F2',
    language: 'en',
    allowPlaylists: true,
    allowSpotify: true,
    commandCooldown: 3,
    maxQueueSize: 100,
    defaultVolume: 50,
    voteSkipThreshold: 50,
}

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
                settings: settings || DEFAULT_GUILD_SETTINGS,
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
