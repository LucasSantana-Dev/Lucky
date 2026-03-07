import type { Express, Response } from 'express'
import { featureToggleService } from '@lukbot/shared/services'
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth'
import { asyncHandler } from '../middleware/asyncHandler'
import { AppError } from '../errors/AppError'
import { getFeatureToggleConfig } from '@lukbot/shared/config'
import type { FeatureToggleName } from '@lukbot/shared/types'

const DEVELOPER_USER_IDS = (process.env.DEVELOPER_USER_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)

function requireDeveloper(userId?: string): void {
    if (!userId || !DEVELOPER_USER_IDS.includes(userId)) {
        throw AppError.forbidden('Developer access required')
    }
}

export function setupToggleRoutes(app: Express): void {
    app.get(
        '/api/toggles/global',
        requireAuth,
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            requireDeveloper(req.userId)

            const toggles = featureToggleService.getAllToggles()
            const result: Record<string, boolean> = {}

            for (const [name] of toggles) {
                result[name] = await featureToggleService.isEnabledGlobal(
                    name,
                    req.userId!,
                )
            }

            res.json({ toggles: result })
        }),
    )

    app.get(
        '/api/toggles/global/:name',
        requireAuth,
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            requireDeveloper(req.userId)

            const toggleName =
                typeof req.params.name === 'string'
                    ? req.params.name
                    : req.params.name[0]

            if (
                !toggleName ||
                !featureToggleService
                    .getAllToggles()
                    .has(toggleName as FeatureToggleName)
            ) {
                throw AppError.badRequest('Invalid toggle name')
            }

            const enabled = await featureToggleService.isEnabledGlobal(
                toggleName as FeatureToggleName,
                req.userId!,
            )

            res.json({ name: toggleName, enabled })
        }),
    )

    app.post(
        '/api/toggles/global/:name',
        requireAuth,
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            requireDeveloper(req.userId)

            const toggleName =
                typeof req.params.name === 'string'
                    ? req.params.name
                    : req.params.name[0]

            if (
                !toggleName ||
                !featureToggleService
                    .getAllToggles()
                    .has(toggleName as FeatureToggleName)
            ) {
                throw AppError.badRequest('Invalid toggle name')
            }

            res.json({
                success: true,
                message: 'Toggle updated via Unleash admin API',
                note: 'Use Unleash admin API to update global toggles',
            })
        }),
    )

    app.get(
        '/api/features',
        requireAuth,
        asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
            const config = getFeatureToggleConfig()
            const features = Object.values(config).map((toggle) => ({
                name: toggle.name,
                description: toggle.description,
            }))

            res.json({ features })
        }),
    )

    app.get(
        '/api/guilds/:id/features',
        requireAuth,
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId =
                typeof req.params.id === 'string'
                    ? req.params.id
                    : req.params.id[0]

            if (!guildId) {
                throw AppError.badRequest('Guild ID required')
            }

            const toggles = featureToggleService.getAllToggles()
            const result: Record<string, boolean> = {}

            for (const [name] of toggles) {
                const enabled = await featureToggleService.isEnabledForGuild(
                    name,
                    guildId,
                    req.userId,
                )
                result[name] = enabled
            }

            res.json({ guildId, toggles: result })
        }),
    )

    app.post(
        '/api/guilds/:id/features/:name',
        requireAuth,
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId =
                typeof req.params.id === 'string'
                    ? req.params.id
                    : req.params.id[0]
            const toggleName =
                typeof req.params.name === 'string'
                    ? req.params.name
                    : req.params.name[0]
            const { enabled } = req.body as { enabled?: boolean }

            if (!guildId || !toggleName) {
                throw AppError.badRequest('Guild ID and toggle name required')
            }

            if (typeof enabled !== 'boolean') {
                throw AppError.badRequest('Enabled must be a boolean')
            }

            if (
                !featureToggleService
                    .getAllToggles()
                    .has(toggleName as FeatureToggleName)
            ) {
                throw AppError.badRequest('Invalid toggle name')
            }

            res.json({
                success: true,
                message: 'Toggle updated via Unleash admin API',
                note: 'Use Unleash admin API to update toggles per guild',
            })
        }),
    )
}
