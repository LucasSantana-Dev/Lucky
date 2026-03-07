import type { Express, Response } from 'express'
import { errorLog } from '@lukbot/shared/utils'
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth'
import {
    validateBody,
    validateParams,
    validateQuery,
} from '../middleware/validate'
import { writeLimiter } from '../middleware/rateLimit'
import { autoMessageSchemas as s } from '../schemas/autoMessages'
import { autoMessageService, serverLogService } from '@lukbot/shared/services'

export function setupAutoMessageRoutes(app: Express): void {
    app.get(
        '/api/guilds/:guildId/automessages',
        requireAuth,
        validateParams(s.guildIdParam),
        validateQuery(s.messagesQuery),
        async (req: AuthenticatedRequest, res: Response) => {
            try {
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
            } catch (error) {
                errorLog({ message: 'Error fetching auto messages:', error })
                res.status(500).json({
                    error: 'Failed to fetch auto messages',
                })
            }
        },
    )

    app.post(
        '/api/guilds/:guildId/automessages',
        requireAuth,
        writeLimiter,
        validateParams(s.guildIdParam),
        validateBody(s.createMessageBody),
        async (req: AuthenticatedRequest, res: Response) => {
            try {
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
            } catch (error) {
                errorLog({ message: 'Error creating auto message:', error })
                res.status(500).json({
                    error: 'Failed to create auto message',
                })
            }
        },
    )

    app.patch(
        '/api/guilds/:guildId/automessages/:id',
        requireAuth,
        writeLimiter,
        validateParams(s.messageIdParam),
        validateBody(s.updateMessageBody),
        async (req: AuthenticatedRequest, res: Response) => {
            try {
                const { guildId, id } = req.params
                const updated = await autoMessageService.updateMessage(
                    id,
                    req.body,
                )
                await serverLogService.logAutoMessageChange(
                    guildId,
                    'updated',
                    { type: updated.type, changes: req.body },
                    req.userId!,
                )
                res.json(updated)
            } catch (error) {
                errorLog({ message: 'Error updating auto message:', error })
                res.status(500).json({
                    error: 'Failed to update auto message',
                })
            }
        },
    )

    app.post(
        '/api/guilds/:guildId/automessages/:id/toggle',
        requireAuth,
        writeLimiter,
        validateParams(s.messageIdParam),
        validateBody(s.toggleBody),
        async (req: AuthenticatedRequest, res: Response) => {
            try {
                const { guildId, id } = req.params
                const { enabled } = req.body
                const updated = await autoMessageService.toggleMessage(
                    id,
                    enabled,
                )
                await serverLogService.logAutoMessageChange(
                    guildId,
                    enabled ? 'enabled' : 'disabled',
                    { type: updated.type },
                    req.userId!,
                )
                res.json(updated)
            } catch (error) {
                errorLog({ message: 'Error toggling auto message:', error })
                res.status(500).json({
                    error: 'Failed to toggle auto message',
                })
            }
        },
    )

    app.delete(
        '/api/guilds/:guildId/automessages/:id',
        requireAuth,
        writeLimiter,
        validateParams(s.messageIdParam),
        async (req: AuthenticatedRequest, res: Response) => {
            try {
                const { guildId, id } = req.params
                await autoMessageService.deleteMessage(id)
                await serverLogService.logAutoMessageChange(
                    guildId,
                    'disabled',
                    { type: 'deleted' },
                    req.userId!,
                )
                res.json({ success: true })
            } catch (error) {
                errorLog({ message: 'Error deleting auto message:', error })
                res.status(500).json({
                    error: 'Failed to delete auto message',
                })
            }
        },
    )
}
