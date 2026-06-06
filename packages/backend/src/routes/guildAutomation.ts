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
import { guildAutomationUsageTotal } from '../utils/prometheus'
import { infoLog } from '@lucky/shared/utils'

function p(val: string | string[]): string {
    return typeof val === 'string' ? val : val[0]
}

function requireUserId(req: AuthenticatedRequest): string {
    if (!req.userId) {
        throw AppError.unauthorized()
    }

    return req.userId
}

/**
 * Records a Guild Automation usage attempt (per-guild, non-PII): increments the
 * Prometheus counter and logs operation + guildId only. Called on ENTRY so failed
 * attempts are counted too — usage demand is the input the freeze-gate decision needs.
 */
function recordAutomationUsage(
    operation: 'plan' | 'apply' | 'reconcile',
    guildId: string,
): void {
    guildAutomationUsageTotal.inc({ operation })
    infoLog({ message: 'Guild Automation usage', data: { operation, guildId } })
}

export function setupGuildAutomationRoutes(app: Express): void {
    app.get(
        '/api/guilds/:guildId/automation/manifest',
        requireGuildModuleAccess('settings', 'view'),
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
        requireGuildModuleAccess('settings', 'manage'),
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
        requireGuildModuleAccess('settings', 'manage'),
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
        requireGuildModuleAccess('settings', 'manage'),
        writeLimiter,
        validateParams(s.guildIdParam),
        validateBody(s.guildAutomationRunBody),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const userId = requireUserId(req)
            recordAutomationUsage('plan', guildId)
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
        requireGuildModuleAccess('settings', 'manage'),
        writeLimiter,
        validateParams(s.guildIdParam),
        validateBody(s.guildAutomationRunBody),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const userId = requireUserId(req)
            recordAutomationUsage('apply', guildId)
            const body = s.guildAutomationRunBody.parse(req.body)
            const actualState = body.actualState
                ? validateGuildAutomationManifest(body.actualState)
                : undefined
            const result = await guildAutomationService.createApplyRun(
                guildId,
                {
                    actualState,
                    initiatedBy: userId,
                    allowProtected: body.allowProtected === true,
                    runType: 'apply',
                },
            )

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
            recordAutomationUsage('reconcile', guildId)
            const body = s.guildAutomationRunBody.parse(req.body)
            const actualState = body.actualState
                ? validateGuildAutomationManifest(body.actualState)
                : undefined
            const result = await guildAutomationService.createApplyRun(
                guildId,
                {
                    actualState,
                    initiatedBy: userId,
                    allowProtected: body.allowProtected === true,
                    runType: 'reconcile',
                },
            )

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
                guildAutomationService.getStatus(guildId),
                guildAutomationService.listRuns(guildId),
            ])

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
            const result = await guildAutomationService.runCutover(guildId, {
                initiatedBy: userId,
                completeChecklist: body.completeChecklist === true,
            })

            res.json(result)
        }),
    )
}
