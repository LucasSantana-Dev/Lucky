import type { Express, NextFunction, Request, Response } from 'express'
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth'
import { requireGuildModuleAccess } from '../middleware/guildAccess'
import { validateBody, validateParams } from '../middleware/validate'
import { writeLimiter } from '../middleware/rateLimit'
import { asyncHandler } from '../middleware/asyncHandler'
import { managementSchemas as s } from '../schemas/management'
import { guildSettingsService, RBAC_MODULES } from '@lucky/shared/services'
import { SUPPORTED_BOT_LANGUAGES } from '@lucky/shared/constants'
import { z } from 'zod'
import { AppError } from '../errors/AppError'
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

// `slug` selects which module's settings UI is calling this endpoint. Reads
// return the whole GuildSettings record, so authorization gates on 'settings'
// access, not the requested module: a 'music:manage' grant must not imply
// access to unrelated fields like prefix or embedColor.
const moduleSlugParam = s.guildIdParam.extend({
    slug: z.enum(RBAC_MODULES),
})

// Writes are limited to the module's own columns (#2637). Every key must also
// appear in `GUILD_SETTINGS_EDITABLE_FIELDS` (enforced by the route test).
// repeatMode is discord-player's QueueRepeatMode: 0 off, 1 track, 2 queue.
export const musicModuleSettingsBody = z
    .object({
        defaultVolume: z.number().int().min(1).max(200).optional(),
        autoPlayEnabled: z.boolean().optional(),
        repeatMode: z.number().int().min(0).max(2).optional(),
        shuffleEnabled: z.boolean().optional(),
    })
    .strict()

const MODULE_SETTINGS_BODIES: Partial<
    Record<(typeof RBAC_MODULES)[number], z.ZodType>
> = {
    music: musicModuleSettingsBody,
}

function validateModuleSettingsBody(
    req: Request,
    res: Response,
    next: NextFunction,
) {
    const schema =
        MODULE_SETTINGS_BODIES[
            p(req.params.slug) as (typeof RBAC_MODULES)[number]
        ]
    if (!schema) {
        next(AppError.notFound('This module has no settings'))
        return
    }
    validateBody(schema)(req, res, next)
}

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
        requireGuildModuleAccess('settings', 'view'),
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
        requireGuildModuleAccess('settings', 'manage'),
        writeLimiter,
        validateParams(s.guildIdParam),
        validateBody(settingsBody),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const saved = await guildSettingsService.setGuildSettings(
                guildId,
                req.body,
            )
            if (!saved) {
                throw new AppError(500, 'Failed to save guild settings')
            }
            res.json({ success: true })
        }),
    )

    app.get(
        '/api/guilds/:guildId/modules/:slug/settings',
        requireAuth,
        requireGuildModuleAccess('settings', 'view'),
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
        requireGuildModuleAccess('settings', 'manage'),
        writeLimiter,
        validateParams(moduleSlugParam),
        validateModuleSettingsBody,
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const saved = await guildSettingsService.setGuildSettings(
                guildId,
                req.body,
            )
            if (!saved) {
                throw new AppError(500, 'Failed to save guild settings')
            }
            res.json({ success: true })
        }),
    )
}
