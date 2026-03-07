import type { Express, Response } from 'express'
import { requireAuth, type AuthenticatedRequest } from '../../middleware/auth'
import { asyncHandler } from '../../middleware/asyncHandler'
import { AppError } from '../../errors/AppError'
import { musicControlService } from '@nexus/shared/services'
import { param, buildCommand } from './helpers'

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
            const { from, to } = req.body
            if (typeof from !== 'number' || typeof to !== 'number') {
                throw AppError.badRequest('From and to positions are required')
            }
            const cmd = buildCommand(guildId, req.userId!, 'queue_move', {
                from,
                to,
            })
            res.json(await musicControlService.sendCommand(cmd))
        }),
    )

    app.post(
        '/api/guilds/:guildId/music/queue/remove',
        requireAuth,
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = param(req.params.guildId)
            const { index } = req.body
            if (typeof index !== 'number') {
                throw AppError.badRequest('Track index is required')
            }
            const cmd = buildCommand(guildId, req.userId!, 'queue_remove', {
                index,
            })
            res.json(await musicControlService.sendCommand(cmd))
        }),
    )

    app.post(
        '/api/guilds/:guildId/music/queue/clear',
        requireAuth,
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = param(req.params.guildId)
            res.json(
                await musicControlService.sendCommand(
                    buildCommand(guildId, req.userId!, 'queue_clear'),
                ),
            )
        }),
    )

    app.post(
        '/api/guilds/:guildId/music/import',
        requireAuth,
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = param(req.params.guildId)
            const { url, voiceChannelId } = req.body
            if (!url) throw AppError.badRequest('Playlist URL is required')

            const cmd = buildCommand(guildId, req.userId!, 'import_playlist', {
                url,
                voiceChannelId,
            })
            res.json(await musicControlService.sendCommand(cmd, 30000))
        }),
    )
}
