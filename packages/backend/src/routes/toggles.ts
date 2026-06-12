import type { Express, Response } from 'express'
import { featureToggleService } from '@lucky/shared/services'
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth'
import { asyncHandler } from '../middleware/asyncHandler'
import { AppError } from '../errors/AppError'
import { getFeatureToggleConfig } from '@lucky/shared/config'
import type { FeatureToggleName } from '@lucky/shared/types'
import { validateBody, validateParams } from '../middleware/validate'
import { togglesSchemas as s } from '../schemas/toggles'

export function setupToggleRoutes(app: Express): void {
    // All /api/toggles/global routes are pre-guarded by requireAdmin in index.ts
    app.get(
        '/api/toggles/global',
        asyncHandler(async (_req: AuthenticatedRequest, res: Response) => {
            const toggles = featureToggleService.getAllToggles()
            const result: Record<string, boolean> = {}
            const sources: Record<string, string> = {}

            for (const [name] of toggles) {
                const state = await featureToggleService.getGlobalToggleStatus(name)
                result[name] = state.enabled
                sources[name] = state.provider
            }

            res.json({
                toggles: result,
                provider: featureToggleService.getGlobalToggleProvider(),
                writable: true,
                sources,
            })
        }),
    )

    app.get(
        '/api/toggles/global/:name',
        validateParams(s.toggleNameParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const toggleName = req.params.name

            if (
                !featureToggleService
                    .getAllToggles()
                    .has(toggleName as FeatureToggleName)
            ) {
                throw AppError.badRequest('Invalid toggle name')
            }

            const state = await featureToggleService.getGlobalToggleStatus(
                toggleName as FeatureToggleName,
            )

            res.json({
                name: toggleName,
                enabled: state.enabled,
                provider: state.provider,
                writable: state.writable,
            })
        }),
    )

    app.post(
        '/api/toggles/global/:name',
        validateParams(s.toggleNameParam),
        validateBody(s.toggleEnabledBody),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const toggleName = req.params.name
            // validateBody(s.toggleEnabledBody) already parsed req.body
            const { enabled } = req.body as { enabled: boolean }

            if (
                !featureToggleService
                    .getAllToggles()
                    .has(toggleName as FeatureToggleName)
            ) {
                throw AppError.badRequest('Invalid toggle name')
            }

            await featureToggleService.setGlobalFeatureToggle(
                toggleName as FeatureToggleName,
                enabled,
            )

            res.json({ success: true, name: toggleName, enabled })
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
}
