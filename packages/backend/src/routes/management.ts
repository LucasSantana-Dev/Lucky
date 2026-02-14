import type { Express, Response } from 'express'
import { errorLog } from '@lukbot/shared/utils'
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth'
import {
    autoModService,
    customCommandService,
    serverLogService,
    type LogType,
} from '@lukbot/shared/services'
import { setupEmbedRoutes } from './managementEmbeds'
import { setupAutoMessageRoutes } from './managementAutoMessages'

function param(val: string | string[]): string {
    return typeof val === 'string' ? val : val[0]
}

export function setupManagementRoutes(app: Express): void {
    // ── AutoMod ──

    app.get(
        '/api/guilds/:guildId/automod/settings',
        requireAuth,
        async (req: AuthenticatedRequest, res: Response) => {
            try {
                const guildId = param(req.params.guildId)
                const settings = await autoModService.getSettings(guildId)
                res.json(settings)
            } catch (error) {
                errorLog({ message: 'Error fetching automod settings:', error })
                res.status(500).json({
                    error: 'Failed to fetch automod settings',
                })
            }
        },
    )

    app.patch(
        '/api/guilds/:guildId/automod/settings',
        requireAuth,
        async (req: AuthenticatedRequest, res: Response) => {
            try {
                const guildId = param(req.params.guildId)
                const settings = await autoModService.updateSettings(
                    guildId,
                    req.body,
                )
                await serverLogService.logAutoModSettingsChange(
                    guildId,
                    {
                        module: 'general',
                        enabled: true,
                        changes: req.body,
                    },
                    req.userId!,
                )
                res.json(settings)
            } catch (error) {
                errorLog({ message: 'Error updating automod settings:', error })
                res.status(500).json({
                    error: 'Failed to update automod settings',
                })
            }
        },
    )

    // ── Custom Commands ──

    app.get(
        '/api/guilds/:guildId/commands',
        requireAuth,
        async (req: AuthenticatedRequest, res: Response) => {
            try {
                const guildId = param(req.params.guildId)
                const commands =
                    await customCommandService.listCommands(guildId)
                res.json({ commands })
            } catch (error) {
                errorLog({ message: 'Error fetching custom commands:', error })
                res.status(500).json({
                    error: 'Failed to fetch custom commands',
                })
            }
        },
    )

    app.post(
        '/api/guilds/:guildId/commands',
        requireAuth,
        async (req: AuthenticatedRequest, res: Response) => {
            try {
                const guildId = param(req.params.guildId)
                const { name, response, description } = req.body
                if (!name || !response)
                    return res
                        .status(400)
                        .json({ error: 'Name and response are required' })
                const command = await customCommandService.createCommand(
                    guildId,
                    name,
                    response,
                    {
                        description,
                        createdBy: req.userId,
                    },
                )
                await serverLogService.logCustomCommandChange(
                    guildId,
                    'created',
                    { commandName: name },
                    req.userId!,
                )
                res.status(201).json(command)
            } catch (error) {
                errorLog({ message: 'Error creating custom command:', error })
                res.status(500).json({
                    error: 'Failed to create custom command',
                })
            }
        },
    )

    app.patch(
        '/api/guilds/:guildId/commands/:name',
        requireAuth,
        async (req: AuthenticatedRequest, res: Response) => {
            try {
                const guildId = param(req.params.guildId)
                const name = param(req.params.name)
                const command = await customCommandService.updateCommand(
                    guildId,
                    name,
                    req.body,
                )
                await serverLogService.logCustomCommandChange(
                    guildId,
                    'updated',
                    { commandName: name, changes: req.body },
                    req.userId!,
                )
                res.json(command)
            } catch (error) {
                errorLog({ message: 'Error updating custom command:', error })
                res.status(500).json({
                    error: 'Failed to update custom command',
                })
            }
        },
    )

    app.delete(
        '/api/guilds/:guildId/commands/:name',
        requireAuth,
        async (req: AuthenticatedRequest, res: Response) => {
            try {
                const guildId = param(req.params.guildId)
                const name = param(req.params.name)
                await customCommandService.deleteCommand(guildId, name)
                await serverLogService.logCustomCommandChange(
                    guildId,
                    'deleted',
                    { commandName: name },
                    req.userId!,
                )
                res.json({ success: true })
            } catch (error) {
                errorLog({ message: 'Error deleting custom command:', error })
                res.status(500).json({
                    error: 'Failed to delete custom command',
                })
            }
        },
    )

    // ── Delegated route groups ──
    setupEmbedRoutes(app)
    setupAutoMessageRoutes(app)

    // ── Server Logs ──

    app.get(
        '/api/guilds/:guildId/logs',
        requireAuth,
        async (req: AuthenticatedRequest, res: Response) => {
            try {
                const guildId = param(req.params.guildId)
                const limit = parseInt(req.query.limit as string) || 50
                const type = req.query.type as string | undefined
                if (type) {
                    const logs = await serverLogService.getLogsByType(
                        guildId,
                        type as LogType,
                        limit,
                    )
                    return res.json({ logs })
                }
                const logs = await serverLogService.getRecentLogs(
                    guildId,
                    limit,
                )
                res.json({ logs })
            } catch (error) {
                errorLog({ message: 'Error fetching server logs:', error })
                res.status(500).json({ error: 'Failed to fetch server logs' })
            }
        },
    )

    app.get(
        '/api/guilds/:guildId/logs/search',
        requireAuth,
        async (req: AuthenticatedRequest, res: Response) => {
            try {
                const guildId = param(req.params.guildId)
                const query = req.query.q as string
                if (!query)
                    return res
                        .status(400)
                        .json({ error: 'Search query is required' })
                const logs = await serverLogService.searchLogs(guildId, {
                    type: req.query.type as LogType | undefined,
                    userId: req.query.userId as string | undefined,
                })
                res.json({ logs })
            } catch (error) {
                errorLog({ message: 'Error searching server logs:', error })
                res.status(500).json({ error: 'Failed to search server logs' })
            }
        },
    )

    app.get(
        '/api/guilds/:guildId/logs/users/:userId',
        requireAuth,
        async (req: AuthenticatedRequest, res: Response) => {
            try {
                const guildId = param(req.params.guildId)
                const userId = param(req.params.userId)
                const logs = await serverLogService.getUserLogs(guildId, userId)
                res.json({ logs })
            } catch (error) {
                errorLog({ message: 'Error fetching user logs:', error })
                res.status(500).json({ error: 'Failed to fetch user logs' })
            }
        },
    )

    app.get(
        '/api/guilds/:guildId/logs/stats',
        requireAuth,
        async (req: AuthenticatedRequest, res: Response) => {
            try {
                const guildId = param(req.params.guildId)
                const stats = await serverLogService.getStats(guildId)
                res.json(stats)
            } catch (error) {
                errorLog({ message: 'Error fetching log stats:', error })
                res.status(500).json({ error: 'Failed to fetch log stats' })
            }
        },
    )
}
