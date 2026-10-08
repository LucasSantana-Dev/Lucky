import type { Express, Response } from 'express'
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth'
import { requireGuildModuleAccess } from '../middleware/guildAccess'
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
    featureToggleService,
    serverLogService,
    serializeServerLog,
    type LogType,
} from '@lucky/shared/services'
import { setupEmbedRoutes } from './managementEmbeds'
import { setupAutoMessageRoutes } from './managementAutoMessages'
import { paramToString as p } from '../utils/paramCoerce'

function requireUserId(req: AuthenticatedRequest): string {
    if (!req.userId) {
        throw AppError.unauthorized()
    }

    return req.userId
}

export function setupManagementRoutes(app: Express): void {
    // Guarded by the `/automod` prefix (moderation) in routes/index.ts, no
    // separate module check here (#2409).
    app.get(
        '/api/guilds/:guildId/automod/settings',
        requireAuth,
        validateParams(s.guildIdParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const settings = await autoModService.getSettings(
                p(req.params.guildId),
            )
            res.json({ settings })
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
            res.json({ settings })
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

    setupEmbedRoutes(app)
    setupAutoMessageRoutes(app)

    // Guarded by the `/logs` prefix (moderation) in routes/index.ts, no
    // separate module check here (#2409).
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
                const [logs, total] = await Promise.all([
                    serverLogService.getLogsByType(
                        guildId,
                        type as LogType,
                        limit,
                    ),
                    serverLogService.countLogsByType(guildId, type as LogType),
                ])
                res.json({ logs: logs.map(serializeServerLog), total })
                return
            }

            const [logs, total] = await Promise.all([
                serverLogService.getRecentLogs(guildId, limit),
                serverLogService.countRecentLogs(guildId),
            ])
            res.json({ logs: logs.map(serializeServerLog), total })
        }),
    )

    app.get(
        '/api/guilds/:guildId/logs/settings',
        requireAuth,
        requireGuildModuleAccess('moderation', 'view'),
        validateParams(s.guildIdParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const enabled = await featureToggleService.isEnabled(
                'SERVER_LOGS',
                { guildId: p(req.params.guildId) },
            )
            res.json({ enabled })
        }),
    )

    app.put(
        '/api/guilds/:guildId/logs/settings',
        requireAuth,
        requireGuildModuleAccess('moderation', 'manage'),
        writeLimiter,
        validateParams(s.guildIdParam),
        validateBody(s.logsSettingsBody),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const { enabled } = s.logsSettingsBody.parse(req.body)
            await featureToggleService.setGuildFeatureToggle(
                guildId,
                'SERVER_LOGS',
                enabled,
            )
            res.json({
                enabled: await featureToggleService.isEnabled('SERVER_LOGS', {
                    guildId,
                }),
            })
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
            const filters = {
                q: query.q,
                type: query.type as LogType | undefined,
                userId: query.userId,
            }
            const limit = query.limit ?? 50
            const offset = query.offset ?? 0
            const [logs, total] = await Promise.all([
                serverLogService.searchLogs(guildId, filters, limit, offset),
                serverLogService.countSearchLogs(guildId, filters),
            ])
            res.json({ logs: logs.map(serializeServerLog), total })
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
            res.json({ logs: logs.map(serializeServerLog) })
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
