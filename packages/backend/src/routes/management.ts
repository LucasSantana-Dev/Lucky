import type { Express, Response } from 'express'
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth'
import {
    validateBody,
    validateParams,
    validateQuery,
} from '../middleware/validate'
import { writeLimiter } from '../middleware/rateLimit'
import { asyncHandler } from '../middleware/asyncHandler'
import { managementSchemas as s } from '../schemas/management'
import {
    autoModService,
    customCommandService,
    serverLogService,
    type LogType,
} from '@nexus/shared/services'
import { setupEmbedRoutes } from './managementEmbeds'
import { setupAutoMessageRoutes } from './managementAutoMessages'

function p(val: string | string[]): string {
    return typeof val === 'string' ? val : val[0]
}

export function setupManagementRoutes(app: Express): void {
    app.get(
        '/api/guilds/:guildId/automod/settings',
        requireAuth,
        validateParams(s.guildIdParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const settings = await autoModService.getSettings(
                p(req.params.guildId),
            )
            res.json(settings)
        }),
    )

    app.patch(
        '/api/guilds/:guildId/automod/settings',
        requireAuth,
        writeLimiter,
        validateParams(s.guildIdParam),
        validateBody(s.autoModSettingsBody),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
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
        }),
    )

    app.get(
        '/api/guilds/:guildId/commands',
        requireAuth,
        validateParams(s.guildIdParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const commands = await customCommandService.listCommands(
                p(req.params.guildId),
            )
            res.json({ commands })
        }),
    )

    app.post(
        '/api/guilds/:guildId/commands',
        requireAuth,
        writeLimiter,
        validateParams(s.guildIdParam),
        validateBody(s.createCommandBody),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const { name, response, description } = req.body
            const command = await customCommandService.createCommand(
                guildId,
                name,
                response,
                { description, createdBy: req.userId },
            )
            await serverLogService.logCustomCommandChange(
                guildId,
                'created',
                { commandName: name },
                req.userId!,
            )
            res.status(201).json(command)
        }),
    )

    app.patch(
        '/api/guilds/:guildId/commands/:name',
        requireAuth,
        writeLimiter,
        validateParams(s.commandNameParam),
        validateBody(s.updateCommandBody),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const name = p(req.params.name)
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
        }),
    )

    app.delete(
        '/api/guilds/:guildId/commands/:name',
        requireAuth,
        writeLimiter,
        validateParams(s.commandNameParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const name = p(req.params.name)
            await customCommandService.deleteCommand(guildId, name)
            await serverLogService.logCustomCommandChange(
                guildId,
                'deleted',
                { commandName: name },
                req.userId!,
            )
            res.json({ success: true })
        }),
    )

    setupEmbedRoutes(app)
    setupAutoMessageRoutes(app)

    app.get(
        '/api/guilds/:guildId/logs',
        requireAuth,
        validateParams(s.guildIdParam),
        validateQuery(s.logsQuery),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const limit = parseInt((req.query.limit as string) || '50')
            const type = req.query.type ? (req.query.type as string) : undefined
            if (type) {
                const logs = await serverLogService.getLogsByType(
                    guildId,
                    type as LogType,
                    limit,
                )
                res.json({ logs })
                return
            }
            const logs = await serverLogService.getRecentLogs(guildId, limit)
            res.json({ logs })
        }),
    )

    app.get(
        '/api/guilds/:guildId/logs/search',
        requireAuth,
        validateParams(s.guildIdParam),
        validateQuery(s.logsSearchQuery),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const logs = await serverLogService.searchLogs(guildId, {
                type: req.query.type
                    ? (req.query.type as string as LogType)
                    : undefined,
                userId: req.query.userId
                    ? (req.query.userId as string)
                    : undefined,
            })
            res.json({ logs })
        }),
    )

    app.get(
        '/api/guilds/:guildId/logs/users/:userId',
        requireAuth,
        validateParams(s.userIdParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const userId = p(req.params.userId)
            const logs = await serverLogService.getUserLogs(guildId, userId)
            res.json({ logs })
        }),
    )

    app.get(
        '/api/guilds/:guildId/logs/stats',
        requireAuth,
        validateParams(s.guildIdParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const stats = await serverLogService.getStats(p(req.params.guildId))
            res.json(stats)
        }),
    )
}
