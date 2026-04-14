import type { Express, Response } from 'express'
import { featureToggleService } from '@lucky/shared/services'
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth'
import { asyncHandler } from '../middleware/asyncHandler'
import { AppError } from '../errors/AppError'
import { getFeatureToggleConfig } from '@lucky/shared/config'
import type { FeatureToggleName } from '@lucky/shared/types'
import { requireDeveloperUser } from '../utils/developerAccess'

function requireUserId(req: AuthenticatedRequest): string {
    if (!req.userId) {
        throw AppError.unauthorized()
    }

    return req.userId
}

export function setupToggleRoutes(app: Express): void {
    app.get(
        '/api/toggles/global',
        requireAuth,
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const userId = requireUserId(req)
            requireDeveloperUser(userId)

            const toggles = featureToggleService.getAllToggles()
            const result: Record<string, boolean> = {}

            for (const [name] of toggles) {
                result[name] = await featureToggleService.isEnabledGlobal(
                    name,
                    userId,
                )
            }

            res.json({ toggles: result })
        }),
    )

    app.get(
        '/api/toggles/global/:name',
        requireAuth,
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const userId = requireUserId(req)
            requireDeveloperUser(userId)

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
                userId,
            )

            res.json({ name: toggleName, enabled })
        }),
    )

    app.post(
        '/api/toggles/global/:name',
        requireAuth,
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            requireDeveloperUser(req.userId)

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

            await featureToggleService.setGuildFeatureToggle(
                guildId,
                toggleName as FeatureToggleName,
                enabled,
            )

            res.json({ success: true, guildId, name: toggleName, enabled })
        }),
    )
}
