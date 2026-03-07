import type { Express, Response } from 'express'
import { errorLog } from '@lukbot/shared/utils'
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth'
import {
    validateBody,
    validateParams,
    validateQuery,
} from '../middleware/validate'
import { writeLimiter } from '../middleware/rateLimit'
import { moderationSchemas as s } from '../schemas/moderation'
import { moderationService, serverLogService } from '@lukbot/shared/services'

export function setupModerationRoutes(app: Express): void {
    app.get(
        '/api/guilds/:guildId/moderation/cases',
        requireAuth,
        validateParams(s.guildIdParam),
        validateQuery(s.casesQuery),
        async (req: AuthenticatedRequest, res: Response) => {
            try {
                const limit = parseInt(req.query.limit as string) || 25
                const cases = await moderationService.getRecentCases(
                    req.params.guildId,
                    limit,
                )
                res.json({ cases })
            } catch (error) {
                errorLog({ message: 'Error fetching moderation cases:', error })
                res.status(500).json({
                    error: 'Failed to fetch moderation cases',
                })
            }
        },
    )

    app.get(
        '/api/guilds/:guildId/moderation/cases/:caseNumber',
        requireAuth,
        validateParams(s.caseNumberParam),
        async (req: AuthenticatedRequest, res: Response) => {
            try {
                const modCase = await moderationService.getCase(
                    req.params.guildId,
                    Number(req.params.caseNumber),
                )
                if (!modCase) {
                    return res.status(404).json({ error: 'Case not found' })
                }
                res.json(modCase)
            } catch (error) {
                errorLog({ message: 'Error fetching case:', error })
                res.status(500).json({ error: 'Failed to fetch case' })
            }
        },
    )

    app.get(
        '/api/guilds/:guildId/moderation/users/:userId/cases',
        requireAuth,
        validateParams(s.userCasesParam),
        validateQuery(s.userCasesQuery),
        async (req: AuthenticatedRequest, res: Response) => {
            try {
                const activeOnly = req.query.activeOnly === 'true'
                const cases = await moderationService.getUserCases(
                    req.params.guildId,
                    req.params.userId,
                    activeOnly,
                )
                res.json({ cases })
            } catch (error) {
                errorLog({ message: 'Error fetching user cases:', error })
                res.status(500).json({ error: 'Failed to fetch user cases' })
            }
        },
    )

    app.patch(
        '/api/guilds/:guildId/moderation/cases/:caseNumber/reason',
        requireAuth,
        writeLimiter,
        validateParams(s.caseNumberParam),
        validateBody(s.updateReasonBody),
        async (req: AuthenticatedRequest, res: Response) => {
            try {
                const { guildId } = req.params
                const caseNumber = Number(req.params.caseNumber)
                const { reason } = req.body

                const modCase = await moderationService.getCase(
                    guildId,
                    caseNumber,
                )
                if (!modCase) {
                    return res.status(404).json({ error: 'Case not found' })
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
            } catch (error) {
                errorLog({ message: 'Error updating case reason:', error })
                res.status(500).json({ error: 'Failed to update case reason' })
            }
        },
    )

    app.post(
        '/api/guilds/:guildId/moderation/cases/:caseId/deactivate',
        requireAuth,
        writeLimiter,
        validateParams(s.caseIdParam),
        async (req: AuthenticatedRequest, res: Response) => {
            try {
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
            } catch (error) {
                errorLog({ message: 'Error deactivating case:', error })
                res.status(500).json({ error: 'Failed to deactivate case' })
            }
        },
    )

    app.get(
        '/api/guilds/:guildId/moderation/settings',
        requireAuth,
        validateParams(s.guildIdParam),
        async (req: AuthenticatedRequest, res: Response) => {
            try {
                const settings = await moderationService.getSettings(
                    req.params.guildId,
                )
                res.json(settings)
            } catch (error) {
                errorLog({
                    message: 'Error fetching moderation settings:',
                    error,
                })
                res.status(500).json({
                    error: 'Failed to fetch moderation settings',
                })
            }
        },
    )

    app.patch(
        '/api/guilds/:guildId/moderation/settings',
        requireAuth,
        writeLimiter,
        validateParams(s.guildIdParam),
        validateBody(s.updateSettingsBody),
        async (req: AuthenticatedRequest, res: Response) => {
            try {
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
            } catch (error) {
                errorLog({
                    message: 'Error updating moderation settings:',
                    error,
                })
                res.status(500).json({
                    error: 'Failed to update moderation settings',
                })
            }
        },
    )

    app.get(
        '/api/guilds/:guildId/moderation/stats',
        requireAuth,
        validateParams(s.guildIdParam),
        async (req: AuthenticatedRequest, res: Response) => {
            try {
                const stats = await moderationService.getStats(
                    req.params.guildId,
                )
                res.json(stats)
            } catch (error) {
                errorLog({ message: 'Error fetching moderation stats:', error })
                res.status(500).json({
                    error: 'Failed to fetch moderation stats',
                })
            }
        },
    )
}
