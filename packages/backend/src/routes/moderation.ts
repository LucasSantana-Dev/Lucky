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
import { moderationService, serverLogService } from '@lucky/shared/services'

function p(val: string | string[]): string {
    return typeof val === 'string' ? val : val[0]
}

function requireUserId(req: AuthenticatedRequest): string {
    if (!req.userId) {
        throw AppError.unauthorized()
    }

    return req.userId
}

export function setupModerationRoutes(app: Express): void {
    app.get(
        '/api/guilds/:guildId/moderation/cases',
        requireAuth,
        validateParams(s.guildIdParam),
        validateQuery(s.casesQuery),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const query = s.casesQuery.parse(req.query)
            const limit = query.limit ?? 25
            const cases = await moderationService.getRecentCases(
                p(req.params.guildId),
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
                p(req.params.guildId),
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
            const query = s.userCasesQuery.parse(req.query)
            const activeOnly = query.activeOnly === 'true'
            const cases = await moderationService.getUserCases(
                p(req.params.guildId),
                p(req.params.userId),
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
            const guildId = p(req.params.guildId)
            const userId = requireUserId(req)
            const caseNumber = Number(req.params.caseNumber)
            const { reason } = s.updateReasonBody.parse(req.body)

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
                userId,
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
            const guildId = p(req.params.guildId)
            const userId = requireUserId(req)
            const caseId = p(req.params.caseId)
            const updated = await moderationService.deactivateCase(caseId)
            await serverLogService.logCaseUpdate(
                guildId,
                {
                    caseNumber: updated.caseNumber,
                    changeType: 'deactivated',
                },
                userId,
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
                p(req.params.guildId),
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
            const guildId = p(req.params.guildId)
            const userId = requireUserId(req)
            const body = s.updateSettingsBody.parse(req.body)
            const settings = await moderationService.updateSettings(
                guildId,
                body,
            )
            await serverLogService.logSettingsChange(
                guildId,
                { setting: 'moderation', newValue: body },
                userId,
            )
            res.json(settings)
        }),
    )

    app.get(
        '/api/guilds/:guildId/moderation/stats',
        requireAuth,
        validateParams(s.guildIdParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const stats = await moderationService.getStats(
                p(req.params.guildId),
            )
            res.json(stats)
        }),
    )
}
