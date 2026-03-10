import type { Express, Response } from 'express'
import { requireAuth, type AuthenticatedRequest } from '../../middleware/auth'
import { asyncHandler } from '../../middleware/asyncHandler'
import { AppError } from '../../errors/AppError'
import { musicControlService } from '@lucky/shared/services'
import { param, buildCommand } from './helpers'

export function setupPlaybackRoutes(app: Express): void {
    app.post(
        '/api/guilds/:guildId/music/play',
        requireAuth,
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = param(req.params.guildId)
            const { query, voiceChannelId } = req.body
            if (!query) throw AppError.badRequest('Query is required')

            const cmd = buildCommand(guildId, req.userId!, 'play', {
                query,
                voiceChannelId,
            })
            res.json(await musicControlService.sendCommand(cmd))
        }),
    )

    app.post(
        '/api/guilds/:guildId/music/pause',
        requireAuth,
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = param(req.params.guildId)
            res.json(
                await musicControlService.sendCommand(
                    buildCommand(guildId, req.userId!, 'pause'),
                ),
            )
        }),
    )

    app.post(
        '/api/guilds/:guildId/music/resume',
        requireAuth,
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = param(req.params.guildId)
            res.json(
                await musicControlService.sendCommand(
                    buildCommand(guildId, req.userId!, 'resume'),
                ),
            )
        }),
    )

    app.post(
        '/api/guilds/:guildId/music/skip',
        requireAuth,
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = param(req.params.guildId)
            res.json(
                await musicControlService.sendCommand(
                    buildCommand(guildId, req.userId!, 'skip'),
                ),
            )
        }),
    )

    app.post(
        '/api/guilds/:guildId/music/stop',
        requireAuth,
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = param(req.params.guildId)
            res.json(
                await musicControlService.sendCommand(
                    buildCommand(guildId, req.userId!, 'stop'),
                ),
            )
        }),
    )

    app.post(
        '/api/guilds/:guildId/music/volume',
        requireAuth,
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = param(req.params.guildId)
            const { volume } = req.body
            if (typeof volume !== 'number' || volume < 0 || volume > 100) {
                throw AppError.badRequest('Volume must be 0-100')
            }
            res.json(
                await musicControlService.sendCommand(
                    buildCommand(guildId, req.userId!, 'volume', {
                        volume,
                    }),
                ),
            )
        }),
    )

    app.post(
        '/api/guilds/:guildId/music/shuffle',
        requireAuth,
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = param(req.params.guildId)
            res.json(
                await musicControlService.sendCommand(
                    buildCommand(guildId, req.userId!, 'shuffle'),
                ),
            )
        }),
    )

    app.post(
        '/api/guilds/:guildId/music/repeat',
        requireAuth,
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = param(req.params.guildId)
            const { mode } = req.body
            if (!['off', 'track', 'queue', 'autoplay'].includes(mode)) {
                throw AppError.badRequest(
                    'Mode must be off, track, queue, or autoplay',
                )
            }
            res.json(
                await musicControlService.sendCommand(
                    buildCommand(guildId, req.userId!, 'repeat', { mode }),
                ),
            )
        }),
    )

    app.post(
        '/api/guilds/:guildId/music/seek',
        requireAuth,
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = param(req.params.guildId)
            const { position } = req.body
            if (typeof position !== 'number' || position < 0) {
                throw AppError.badRequest(
                    'Position must be a positive number (ms)',
                )
            }
            res.json(
                await musicControlService.sendCommand(
                    buildCommand(guildId, req.userId!, 'seek', {
                        position,
                    }),
                ),
            )
        }),
    )
}
