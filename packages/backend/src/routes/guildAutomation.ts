import type { Express, Response } from 'express'
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth'
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
        requireAuth,
        validateParams(s.guildIdParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const manifest = await guildAutomationService.getManifest(guildId)

            if (!manifest) {
                res.status(404).json({ error: 'Automation manifest not found' })
                return
            }

            res.json(manifest)
        }),
    )

    app.put(
        '/api/guilds/:guildId/automation/manifest',
        requireAuth,
        writeLimiter,
        validateParams(s.guildIdParam),
        validateBody(s.guildAutomationManifestBody),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const userId = requireUserId(req)
            const manifest = validateGuildAutomationManifest(req.body)
            const saved = await guildAutomationService.saveManifest(
                guildId,
                manifest,
                { createdBy: userId },
            )

            res.json({
                guildId: saved.guildId,
                version: saved.version,
                updatedAt: saved.updatedAt,
            })
        }),
    )

    app.post(
        '/api/guilds/:guildId/automation/capture',
        requireAuth,
        writeLimiter,
        validateParams(s.guildIdParam),
        validateBody(s.guildAutomationManifestBody),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const userId = requireUserId(req)
            const captured = validateGuildAutomationManifest(req.body)
            const result = await guildAutomationService.recordCapture(
                guildId,
                captured,
                userId,
            )

            res.status(201).json(result)
        }),
    )

    app.post(
        '/api/guilds/:guildId/automation/plan',
        requireAuth,
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
            const plan = await guildAutomationService.createPlan(guildId, {
                actualState,
                initiatedBy: userId,
                runType: 'plan',
            })

            res.json(plan)
        }),
    )

    app.post(
        '/api/guilds/:guildId/automation/apply',
        requireAuth,
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
            const result = await guildAutomationService.createApplyRun(guildId, {
                actualState,
                initiatedBy: userId,
                allowProtected: body.allowProtected === true,
                runType: 'apply',
            })

            res.json(result)
        }),
    )

    app.post(
        '/api/guilds/:guildId/automation/reconcile',
        requireAuth,
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
            const result = await guildAutomationService.createApplyRun(guildId, {
                actualState,
                initiatedBy: userId,
                allowProtected: body.allowProtected === true,
                runType: 'reconcile',
            })

            res.json(result)
        }),
    )

    app.get(
        '/api/guilds/:guildId/automation/status',
        requireAuth,
        validateParams(s.guildIdParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const [status, runs] = await Promise.all([
                guildAutomationService.getStatus(guildId),
                guildAutomationService.listRuns(guildId),
            ])

            res.json({ status, runs })
        }),
    )

    app.post(
        '/api/guilds/:guildId/automation/cutover',
        requireAuth,
        writeLimiter,
        validateParams(s.guildIdParam),
        validateBody(s.guildAutomationRunBody),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const userId = requireUserId(req)
            const body = s.guildAutomationRunBody.parse(req.body)
            const result = await guildAutomationService.runCutover(guildId, {
                initiatedBy: userId,
                completeChecklist: body.completeChecklist === true,
            })

            res.json(result)
        }),
    )

    app.post(
        '/api/guilds/:guildId/automation/presets/criativaria/apply',
        requireAuth,
        writeLimiter,
        validateParams(s.guildIdParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const userId = requireUserId(req)

            const preset = buildCriativariaPreset(guildId)
            const saved = await guildAutomationService.saveManifest(
                guildId,
                preset,
                { createdBy: userId },
            )

            const run = await guildAutomationService.createApplyRun(guildId, {
                actualState: preset,
                initiatedBy: userId,
                allowProtected: false,
                runType: 'reconcile',
            })

            res.json({
                success: true,
                preset: 'criativaria',
                manifestVersion: saved.version,
                run,
            })
        }),
    )
}
