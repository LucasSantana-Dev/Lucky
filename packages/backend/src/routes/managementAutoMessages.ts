import type { Express, Response } from 'express'
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth'
import {
    validateBody,
    validateParams,
    validateQuery,
} from '../middleware/validate'
import { writeLimiter } from '../middleware/rateLimit'
import { asyncHandler } from '../middleware/asyncHandler'
import { autoMessageSchemas as s } from '../schemas/autoMessages'
import { autoMessageService, serverLogService } from '@lukbot/shared/services'

export function setupAutoMessageRoutes(app: Express): void {
    app.get(
        '/api/guilds/:guildId/automessages',
        requireAuth,
        validateParams(s.guildIdParam),
        validateQuery(s.messagesQuery),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const { guildId } = req.params
            const type = req.query.type as string | undefined
            if (type) {
                const messages = await autoMessageService.getMessagesByType(
                    guildId,
                    type as any,
                )
                return res.json({ messages })
            }
            const [welcome, leave] = await Promise.all([
                autoMessageService.getWelcomeMessage(guildId),
                autoMessageService.getLeaveMessage(guildId),
            ])
            res.json({ welcome, leave })
        }),
    )

    app.post(
        '/api/guilds/:guildId/automessages',
        requireAuth,
        writeLimiter,
        validateParams(s.guildIdParam),
        validateBody(s.createMessageBody),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const { guildId } = req.params
            const {
                type,
                message,
                channelId,
                trigger,
                exactMatch,
                cronSchedule,
            } = req.body
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
                req.userId!,
            )
            res.status(201).json(autoMsg)
        }),
    )

    app.patch(
        '/api/guilds/:guildId/automessages/:id',
        requireAuth,
        writeLimiter,
        validateParams(s.messageIdParam),
        validateBody(s.updateMessageBody),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const { guildId, id } = req.params
            const updated = await autoMessageService.updateMessage(id, req.body)
            await serverLogService.logAutoMessageChange(
                guildId,
                'updated',
                { type: updated.type, changes: req.body },
                req.userId!,
            )
            res.json(updated)
        }),
    )

    app.post(
        '/api/guilds/:guildId/automessages/:id/toggle',
        requireAuth,
        writeLimiter,
        validateParams(s.messageIdParam),
        validateBody(s.toggleBody),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const { guildId, id } = req.params
            const { enabled } = req.body
            const updated = await autoMessageService.toggleMessage(id, enabled)
            await serverLogService.logAutoMessageChange(
                guildId,
                enabled ? 'enabled' : 'disabled',
                { type: updated.type },
                req.userId!,
            )
            res.json(updated)
        }),
    )

    app.delete(
        '/api/guilds/:guildId/automessages/:id',
        requireAuth,
        writeLimiter,
        validateParams(s.messageIdParam),
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const { guildId, id } = req.params
            await autoMessageService.deleteMessage(id)
            await serverLogService.logAutoMessageChange(
                guildId,
                'disabled',
                { type: 'deleted' },
                req.userId!,
            )
            res.json({ success: true })
        }),
    )
}
