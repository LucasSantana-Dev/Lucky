import type { Express, Response } from 'express'
import type { AuthenticatedRequest } from '../middleware/auth'
import { requireGuildModuleAccess } from '../middleware/guildAccess'
import { validateBody, validateParams } from '../middleware/validate'
import { writeLimiter } from '../middleware/rateLimit'
import { asyncHandler } from '../middleware/asyncHandler'
import { AppError } from '../errors/AppError'
import { managementSchemas as s } from '../schemas/management'
import {
    guildAutomationService,
    validateGuildAutomationManifest,
} from '@lucky/shared/services'
import { buildCriativariaPreset } from '../constants/guildAutomationPresets'

function p(val: string | string[]): string {
    return typeof val === 'string' ? val : val[0]
}

function requireUserId(req: AuthenticatedRequest): string {
    if (!req.userId) {
        throw AppError.unauthorized()
    }

    return req.userId
}

export function setupGuildAutomationRoutes(app: Express): void {
    app.get(
        '/api/guilds/:guildId/automation/manifest',
        requireGuildModuleAccess('settings', 'view'),
        validateParams(s.guildIdParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const manifest = (await guildAutomationService.getManifest(guildId)) as unknown

            if (!manifest) {
                res.status(404).json({ error: 'Automation manifest not found' })
                return
            }

            res.json(manifest)
        }),
    )

    app.put(
        '/api/guilds/:guildId/automation/manifest',
        requireGuildModuleAccess('settings', 'manage'),
        writeLimiter,
        validateParams(s.guildIdParam),
        validateBody(s.guildAutomationManifestBody),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const userId = requireUserId(req)
            const manifest = validateGuildAutomationManifest(req.body)
            const saved = (await guildAutomationService.saveManifest(
                guildId,
                manifest,
                { createdBy: userId },
            )) as unknown

            res.json({
                guildId: ((saved as Record<string, unknown>).guildId as string),
                version: ((saved as Record<string, unknown>).version as number),
                updatedAt: ((saved as Record<string, unknown>).updatedAt as string),
            })
        }),
    )

    app.post(
        '/api/guilds/:guildId/automation/capture',
        requireGuildModuleAccess('settings', 'manage'),
        writeLimiter,
        validateParams(s.guildIdParam),
        validateBody(s.guildAutomationManifestBody),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const userId = requireUserId(req)
            const captured = validateGuildAutomationManifest(req.body)
            const result = (await guildAutomationService.recordCapture(
                guildId,
                captured,
                userId,
            )) as unknown

            res.status(201).json(result)
        }),
    )

    app.post(
        '/api/guilds/:guildId/automation/plan',
        requireGuildModuleAccess('settings', 'manage'),
        writeLimiter,
        validateParams(s.guildIdParam),
        validateBody(s.guildAutomationRunBody),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const userId = requireUserId(req)
            const body = s.guildAutomationRunBody.parse(req.body)
            const actualState = body.actualState
                ? validateGuildAutomationManifest(body.actualState)
                : undefined
            const plan = (await guildAutomationService.createPlan(guildId, {
                actualState,
                initiatedBy: userId,
                runType: 'plan',
            })) as unknown

            res.json(plan)
        }),
    )

    app.post(
        '/api/guilds/:guildId/automation/apply',
        requireGuildModuleAccess('settings', 'manage'),
        writeLimiter,
        validateParams(s.guildIdParam),
        validateBody(s.guildAutomationRunBody),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const userId = requireUserId(req)
            const body = s.guildAutomationRunBody.parse(req.body)
            const actualState = body.actualState
                ? validateGuildAutomationManifest(body.actualState)
                : undefined
            const result = (await guildAutomationService.createApplyRun(
                guildId,
                {
                    actualState,
                    initiatedBy: userId,
                    allowProtected: body.allowProtected === true,
                    runType: 'apply',
                },
            )) as unknown

            res.json(result)
        }),
    )

    app.post(
        '/api/guilds/:guildId/automation/reconcile',
        requireGuildModuleAccess('settings', 'manage'),
        writeLimiter,
        validateParams(s.guildIdParam),
        validateBody(s.guildAutomationRunBody),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const userId = requireUserId(req)
            const body = s.guildAutomationRunBody.parse(req.body)
            const actualState = body.actualState
                ? validateGuildAutomationManifest(body.actualState)
                : undefined
            const result = (await guildAutomationService.createApplyRun(
                guildId,
                {
                    actualState,
                    initiatedBy: userId,
                    allowProtected: body.allowProtected === true,
                    runType: 'reconcile',
                },
            )) as unknown

            res.json(result)
        }),
    )

    app.get(
        '/api/guilds/:guildId/automation/status',
        requireGuildModuleAccess('settings', 'view'),
        validateParams(s.guildIdParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const [status, runs] = await Promise.all([
                guildAutomationService.getStatus(guildId) as unknown,
                guildAutomationService.listRuns(guildId) as unknown,
            ]) as [unknown, unknown]

            res.json({ status, runs })
        }),
    )

    app.post(
        '/api/guilds/:guildId/automation/cutover',
        requireGuildModuleAccess('settings', 'manage'),
        writeLimiter,
        validateParams(s.guildIdParam),
        validateBody(s.guildAutomationRunBody),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const userId = requireUserId(req)
            const body = s.guildAutomationRunBody.parse(req.body)
            const result = (await guildAutomationService.runCutover(guildId, {
                initiatedBy: userId,
                completeChecklist: body.completeChecklist === true,
            })) as unknown

            res.json(result)
        }),
    )

    app.post(
        '/api/guilds/:guildId/automation/presets/criativaria/apply',
        requireGuildModuleAccess('settings', 'manage'),
        writeLimiter,
        validateParams(s.guildIdParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const userId = requireUserId(req)

            const preset = buildCriativariaPreset(guildId)
            const saved = (await guildAutomationService.saveManifest(
                guildId,
                preset,
                { createdBy: userId },
            )) as unknown

            const run = (await guildAutomationService.createApplyRun(guildId, {
                actualState: preset,
                initiatedBy: userId,
                allowProtected: false,
                runType: 'reconcile',
            })) as unknown

            res.json({
                success: true,
                preset: 'criativaria',
                manifestVersion: ((saved as Record<string, unknown>).version as number),
                run,
            })
        }),
    )
}
