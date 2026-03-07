import type { Express, Response } from 'express'
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth'
import {
    validateBody,
    validateParams,
    validateQuery,
} from '../middleware/validate'
import { writeLimiter } from '../middleware/rateLimit'
import { asyncHandler } from '../middleware/asyncHandler'
import { AppError } from '../errors/AppError'
import { moderationSchemas as s } from '../schemas/moderation'
import { moderationService, serverLogService } from '@lukbot/shared/services'

export function setupModerationRoutes(app: Express): void {
    app.get(
        '/api/guilds/:guildId/moderation/cases',
        requireAuth,
        validateParams(s.guildIdParam),
        validateQuery(s.casesQuery),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const limit = parseInt(req.query.limit as string) || 25
            const cases = await moderationService.getRecentCases(
                req.params.guildId,
                limit,
            )
            res.json({ cases })
        }),
    )

    app.get(
        '/api/guilds/:guildId/moderation/cases/:caseNumber',
        requireAuth,
        validateParams(s.caseNumberParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const modCase = await moderationService.getCase(
                req.params.guildId,
                Number(req.params.caseNumber),
            )
            if (!modCase) {
                throw AppError.notFound('Case not found')
            }
            res.json(modCase)
        }),
    )

    app.get(
        '/api/guilds/:guildId/moderation/users/:userId/cases',
        requireAuth,
        validateParams(s.userCasesParam),
        validateQuery(s.userCasesQuery),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const activeOnly = req.query.activeOnly === 'true'
            const cases = await moderationService.getUserCases(
                req.params.guildId,
                req.params.userId,
                activeOnly,
            )
            res.json({ cases })
        }),
    )

    app.patch(
        '/api/guilds/:guildId/moderation/cases/:caseNumber/reason',
        requireAuth,
        writeLimiter,
        validateParams(s.caseNumberParam),
        validateBody(s.updateReasonBody),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const { guildId } = req.params
            const caseNumber = Number(req.params.caseNumber)
            const { reason } = req.body

            const modCase = await moderationService.getCase(guildId, caseNumber)
            if (!modCase) {
                throw AppError.notFound('Case not found')
            }

            await serverLogService.logCaseUpdate(
                guildId,
                {
                    caseNumber,
                    changeType: 'reason_update',
                    oldValue: modCase.reason ?? undefined,
                    newValue: reason,
                },
                req.userId!,
            )
            res.json({ success: true })
        }),
    )

    app.post(
        '/api/guilds/:guildId/moderation/cases/:caseId/deactivate',
        requireAuth,
        writeLimiter,
        validateParams(s.caseIdParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const { guildId, caseId } = req.params
            const updated = await moderationService.deactivateCase(caseId)
            await serverLogService.logCaseUpdate(
                guildId,
                {
                    caseNumber: updated.caseNumber,
                    changeType: 'deactivated',
                },
                req.userId!,
            )
            res.json(updated)
        }),
    )

    app.get(
        '/api/guilds/:guildId/moderation/settings',
        requireAuth,
        validateParams(s.guildIdParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const settings = await moderationService.getSettings(
                req.params.guildId,
            )
            res.json(settings)
        }),
    )

    app.patch(
        '/api/guilds/:guildId/moderation/settings',
        requireAuth,
        writeLimiter,
        validateParams(s.guildIdParam),
        validateBody(s.updateSettingsBody),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const { guildId } = req.params
            const settings = await moderationService.updateSettings(
                guildId,
                req.body,
            )
            await serverLogService.logSettingsChange(
                guildId,
                { setting: 'moderation', newValue: req.body },
                req.userId!,
            )
            res.json(settings)
        }),
    )

    app.get(
        '/api/guilds/:guildId/moderation/stats',
        requireAuth,
        validateParams(s.guildIdParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const stats = await moderationService.getStats(req.params.guildId)
            res.json(stats)
        }),
    )
}
