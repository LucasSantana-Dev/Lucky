import type { Express, Response } from 'express'
import { errorLog } from '@lukbot/shared/utils'
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth'
import { moderationService, serverLogService } from '@lukbot/shared/services'

function param(val: string | string[]): string {
    return typeof val === 'string' ? val : val[0]
}

export function setupModerationRoutes(app: Express): void {
    // Get recent moderation cases for a guild
    app.get(
        '/api/guilds/:guildId/moderation/cases',
        requireAuth,
        async (req: AuthenticatedRequest, res: Response) => {
            try {
                const guildId = param(req.params.guildId)
                const limit = parseInt(req.query.limit as string) || 25

                const cases = await moderationService.getRecentCases(
                    guildId,
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

    // Get a specific case
    app.get(
        '/api/guilds/:guildId/moderation/cases/:caseNumber',
        requireAuth,
        async (req: AuthenticatedRequest, res: Response) => {
            try {
                const guildId = param(req.params.guildId)
                const caseNumber = param(req.params.caseNumber)
                const modCase = await moderationService.getCase(
                    guildId,
                    parseInt(caseNumber),
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

    // Get cases for a specific user
    app.get(
        '/api/guilds/:guildId/moderation/users/:userId/cases',
        requireAuth,
        async (req: AuthenticatedRequest, res: Response) => {
            try {
                const guildId = param(req.params.guildId)
                const userId = param(req.params.userId)
                const activeOnly = req.query.activeOnly === 'true'

                const cases = await moderationService.getUserCases(
                    guildId,
                    userId,
                    activeOnly,
                )

                res.json({ cases })
            } catch (error) {
                errorLog({ message: 'Error fetching user cases:', error })
                res.status(500).json({ error: 'Failed to fetch user cases' })
            }
        },
    )

    // Update case reason
    app.patch(
        '/api/guilds/:guildId/moderation/cases/:caseNumber/reason',
        requireAuth,
        async (req: AuthenticatedRequest, res: Response) => {
            try {
                const guildId = param(req.params.guildId)
                const caseNumber = param(req.params.caseNumber)
                const { reason } = req.body

                if (!reason || typeof reason !== 'string') {
                    return res.status(400).json({ error: 'Reason is required' })
                }

                const modCase = await moderationService.getCase(
                    guildId,
                    parseInt(caseNumber),
                )
                if (!modCase) {
                    return res.status(404).json({ error: 'Case not found' })
                }

                await serverLogService.logCaseUpdate(
                    guildId,
                    {
                        caseNumber: parseInt(caseNumber),
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

    // Deactivate a case
    app.post(
        '/api/guilds/:guildId/moderation/cases/:caseId/deactivate',
        requireAuth,
        async (req: AuthenticatedRequest, res: Response) => {
            try {
                const guildId = param(req.params.guildId)
                const caseId = param(req.params.caseId)

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

    // Get moderation settings
    app.get(
        '/api/guilds/:guildId/moderation/settings',
        requireAuth,
        async (req: AuthenticatedRequest, res: Response) => {
            try {
                const guildId = param(req.params.guildId)

                const settings = await moderationService.getSettings(guildId)

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

    // Update moderation settings
    app.patch(
        '/api/guilds/:guildId/moderation/settings',
        requireAuth,
        async (req: AuthenticatedRequest, res: Response) => {
            try {
                const guildId = param(req.params.guildId)

                const settings = await moderationService.updateSettings(
                    guildId,
                    req.body,
                )

                await serverLogService.logSettingsChange(
                    guildId,
                    {
                        setting: 'moderation',
                        newValue: req.body,
                    },
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

    // Get moderation stats
    app.get(
        '/api/guilds/:guildId/moderation/stats',
        requireAuth,
        async (req: AuthenticatedRequest, res: Response) => {
            try {
                const guildId = param(req.params.guildId)

                const stats = await moderationService.getStats(guildId)

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
