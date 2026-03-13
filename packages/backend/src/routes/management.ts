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
import { managementSchemas as s } from '../schemas/management'
import {
    AutoModTemplateNotFoundError,
    autoModService,
    customCommandService,
    serverLogService,
    type LogType,
} from '@lucky/shared/services'
import { setupEmbedRoutes } from './managementEmbeds'
import { setupAutoMessageRoutes } from './managementAutoMessages'

function p(val: string | string[]): string {
    return typeof val === 'string' ? val : val[0]
}

function requireUserId(req: AuthenticatedRequest): string {
    if (!req.userId) {
        throw AppError.unauthorized()
    }

    return req.userId
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
            const userId = requireUserId(req)
            const body = s.autoModSettingsBody.parse(req.body)
            const settings = await autoModService.updateSettings(guildId, body)

            await serverLogService.logAutoModSettingsChange(
                guildId,
                {
                    module: 'general',
                    enabled: true,
                    changes: body,
                },
                userId,
            )
            res.json(settings)
        }),
    )

    app.get(
        '/api/guilds/:guildId/automod/templates',
        requireAuth,
        validateParams(s.guildIdParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const templates = await autoModService.listTemplates()
            res.json({ templates })
        }),
    )

    app.post(
        '/api/guilds/:guildId/automod/templates/:templateId/apply',
        requireAuth,
        writeLimiter,
        validateParams(s.autoModTemplateParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const templateId = p(req.params.templateId)
            const userId = requireUserId(req)

            try {
                const result = await autoModService.applyTemplate(
                    guildId,
                    templateId,
                )
                await serverLogService.logAutoModSettingsChange(
                    guildId,
                    {
                        module: 'general',
                        enabled: Boolean(result.settings.enabled),
                        changes: {
                            templateId: result.template.id,
                            settings: result.settings,
                        },
                    },
                    userId,
                )
                res.json({
                    templateId: result.template.id,
                    settings: result.settings,
                })
            } catch (error) {
                if (error instanceof AutoModTemplateNotFoundError) {
                    throw AppError.notFound('Auto-mod template not found')
                }
                throw error
            }
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
            const userId = requireUserId(req)
            const body = s.createCommandBody.parse(req.body)
            const { name, response, description } = body
            const command = await customCommandService.createCommand(
                guildId,
                name,
                response,
                { description, createdBy: userId },
            )
            await serverLogService.logCustomCommandChange(
                guildId,
                'created',
                { commandName: name },
                userId,
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
            const userId = requireUserId(req)
            const name = p(req.params.name)
            const body = s.updateCommandBody.parse(req.body)
            const command = await customCommandService.updateCommand(
                guildId,
                name,
                body,
            )
            await serverLogService.logCustomCommandChange(
                guildId,
                'updated',
                { commandName: name, changes: body },
                userId,
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
            const userId = requireUserId(req)
            const name = p(req.params.name)
            await customCommandService.deleteCommand(guildId, name)
            await serverLogService.logCustomCommandChange(
                guildId,
                'deleted',
                { commandName: name },
                userId,
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
            const query = s.logsQuery.parse(req.query)
            const limit = query.limit ?? 50
            const type = query.type

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
            const query = s.logsSearchQuery.parse(req.query)
            const logs = await serverLogService.searchLogs(guildId, {
                type: query.type as LogType | undefined,
                userId: query.userId,
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
