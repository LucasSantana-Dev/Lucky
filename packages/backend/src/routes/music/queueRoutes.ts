import type { Express, Response } from 'express'
import { z } from 'zod'
import { requireAuth, type AuthenticatedRequest } from '../../middleware/auth'
import { asyncHandler } from '../../middleware/asyncHandler'
import { AppError } from '../../errors/AppError'
import { musicControlService } from '@lucky/shared/services'
import { param, buildCommand } from './helpers'

const moveQueueBodySchema = z.object({
    from: z.number(),
    to: z.number(),
})

const removeQueueBodySchema = z.object({
    index: z.number(),
})

const importBodySchema = z.object({
    url: z.string().min(1),
    voiceChannelId: z.string().min(1).optional(),
})

function requireUserId(req: AuthenticatedRequest): string {
    if (!req.userId) {
        throw AppError.unauthorized()
    }

    return req.userId
}

export function setupQueueRoutes(app: Express): void {
    app.get(
        '/api/guilds/:guildId/music/queue',
        requireAuth,
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = param(req.params.guildId)
            const state = await musicControlService.getState(guildId)
            res.json({
                currentTrack: state?.currentTrack ?? null,
                tracks: state?.tracks ?? [],
                total: state?.tracks.length ?? 0,
            })
        }),
    )

    app.post(
        '/api/guilds/:guildId/music/queue/move',
        requireAuth,
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = param(req.params.guildId)
            const userId = requireUserId(req)
            const body = moveQueueBodySchema.safeParse(req.body)

            if (!body.success) {
                throw AppError.badRequest('From and to positions are required')
            }

            const cmd = buildCommand(guildId, userId, 'queue_move', {
                from: body.data.from,
                to: body.data.to,
            })
            res.json(await musicControlService.sendCommand(cmd))
        }),
    )

    app.post(
        '/api/guilds/:guildId/music/queue/remove',
        requireAuth,
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = param(req.params.guildId)
            const userId = requireUserId(req)
            const body = removeQueueBodySchema.safeParse(req.body)

            if (!body.success) {
                throw AppError.badRequest('Track index is required')
            }

            const cmd = buildCommand(guildId, userId, 'queue_remove', {
                index: body.data.index,
            })
            res.json(await musicControlService.sendCommand(cmd))
        }),
    )

    app.post(
        '/api/guilds/:guildId/music/queue/clear',
        requireAuth,
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = param(req.params.guildId)
            const userId = requireUserId(req)
            res.json(
                await musicControlService.sendCommand(
                    buildCommand(guildId, userId, 'queue_clear'),
                ),
            )
        }),
    )

    app.post(
        '/api/guilds/:guildId/music/import',
        requireAuth,
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = param(req.params.guildId)
            const userId = requireUserId(req)
            const body = importBodySchema.safeParse(req.body)

            if (!body.success) {
                throw AppError.badRequest('Playlist URL is required')
            }

            const cmd = buildCommand(guildId, userId, 'import_playlist', {
                url: body.data.url,
                voiceChannelId: body.data.voiceChannelId,
            })
            res.json(await musicControlService.sendCommand(cmd, 30000))
        }),
    )
}
