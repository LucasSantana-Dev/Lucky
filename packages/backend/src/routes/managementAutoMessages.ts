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
import { autoMessageSchemas as s } from '../schemas/autoMessages'
import { autoMessageService, serverLogService } from '@lucky/shared/services'

function p(val: string | string[]): string {
    return typeof val === 'string' ? val : val[0]
}

function requireUserId(req: AuthenticatedRequest): string {
    if (!req.userId) {
        throw AppError.unauthorized()
    }

    return req.userId
}

export function setupAutoMessageRoutes(app: Express): void {
    app.get(
        '/api/guilds/:guildId/automessages',
        requireAuth,
        requireGuildModuleAccess('automation', 'view'),
        validateParams(s.guildIdParam),
        validateQuery(s.messagesQuery),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const query = s.messagesQuery.parse(req.query)
            const type = query.type

            if (type) {
                const messages = await autoMessageService.getMessagesByType(
                    guildId,
                    type as 'welcome' | 'leave',
                )
                res.json({ messages })
                return
            }

            const [welcome, leave] = await Promise.all([
                autoMessageService.getWelcomeMessage(guildId),
                autoMessageService.getLeaveMessage(guildId),
            ])

            const messages = [welcome, leave].filter(
                (message): message is NonNullable<typeof message> =>
                    message !== null,
            )

            res.json({ messages })
        }),
    )

    app.post(
        '/api/guilds/:guildId/automessages',
        requireAuth,
        requireGuildModuleAccess('automation', 'manage'),
        writeLimiter,
        validateParams(s.guildIdParam),
        validateBody(s.createMessageBody),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const userId = requireUserId(req)
            const body = s.createMessageBody.parse(req.body)
            const {
                type,
                message,
                channelId,
                trigger,
                exactMatch,
                cronSchedule,
            } = body
            const autoMsg = await autoMessageService.createMessage(
                guildId,
                type,
                { message },
                { channelId, trigger, exactMatch, cronSchedule },
            )
            await serverLogService.logAutoMessageChange(
                guildId,
                'created',
                { type, channelId },
                userId,
            )
            res.status(201).json(autoMsg)
        }),
    )

    app.patch(
        '/api/guilds/:guildId/automessages/:id',
        requireAuth,
        requireGuildModuleAccess('automation', 'manage'),
        writeLimiter,
        validateParams(s.messageIdParam),
        validateBody(s.updateMessageBody),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const userId = requireUserId(req)
            const id = p(req.params.id)
            const body = s.updateMessageBody.parse(req.body)
            const updated = await autoMessageService.updateMessage(id, body)
            await serverLogService.logAutoMessageChange(
                guildId,
                'updated',
                { type: updated.type, changes: body },
                userId,
            )
            res.json(updated)
        }),
    )

    app.post(
        '/api/guilds/:guildId/automessages/:id/toggle',
        requireAuth,
        requireGuildModuleAccess('automation', 'manage'),
        writeLimiter,
        validateParams(s.messageIdParam),
        validateBody(s.toggleBody),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const userId = requireUserId(req)
            const id = p(req.params.id)
            const { enabled } = s.toggleBody.parse(req.body)
            const updated = await autoMessageService.toggleMessage(id, enabled)
            await serverLogService.logAutoMessageChange(
                guildId,
                enabled ? 'enabled' : 'disabled',
                { type: updated.type },
                userId,
            )
            res.json(updated)
        }),
    )

    app.delete(
        '/api/guilds/:guildId/automessages/:id',
        requireAuth,
        requireGuildModuleAccess('automation', 'manage'),
        writeLimiter,
        validateParams(s.messageIdParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = p(req.params.guildId)
            const userId = requireUserId(req)
            const id = p(req.params.id)
            await autoMessageService.deleteMessage(id)
            await serverLogService.logAutoMessageChange(
                guildId,
                'disabled',
                { type: 'deleted' },
                userId,
            )
            res.json({ success: true })
        }),
    )
}
