import type { Express, Response } from 'express'
import { z } from 'zod'
import { requireAuth, type AuthenticatedRequest } from '../../middleware/auth'
import { asyncHandler } from '../../middleware/asyncHandler'
import { AppError } from '../../errors/AppError'
import { musicControlService } from '@lucky/shared/services'
import { param, buildCommand } from './helpers'

const playBodySchema = z.object({
    query: z.string().min(1),
    voiceChannelId: z.string().min(1).optional(),
})

const volumeBodySchema = z.object({
    volume: z.number().min(0).max(100),
})

const repeatBodySchema = z.object({
    mode: z.enum(['off', 'track', 'queue', 'autoplay']),
})

const seekBodySchema = z.object({
    position: z.number().min(0),
})

function requireUserId(req: AuthenticatedRequest): string {
    if (!req.userId) {
        throw AppError.unauthorized()
    }

    return req.userId
}

export function setupPlaybackRoutes(app: Express): void {
    app.post(
        '/api/guilds/:guildId/music/play',
        requireAuth,
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = param(req.params.guildId)
            const userId = requireUserId(req)
            const body = playBodySchema.safeParse(req.body)

            if (!body.success) {
                throw AppError.badRequest('Query is required')
            }

            const { query, voiceChannelId } = body.data
            const cmd = buildCommand(guildId, userId, 'play', {
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
            const userId = requireUserId(req)
            res.json(
                await musicControlService.sendCommand(
                    buildCommand(guildId, userId, 'pause'),
                ),
            )
        }),
    )

    app.post(
        '/api/guilds/:guildId/music/resume',
        requireAuth,
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = param(req.params.guildId)
            const userId = requireUserId(req)
            res.json(
                await musicControlService.sendCommand(
                    buildCommand(guildId, userId, 'resume'),
                ),
            )
        }),
    )

    app.post(
        '/api/guilds/:guildId/music/skip',
        requireAuth,
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = param(req.params.guildId)
            const userId = requireUserId(req)
            res.json(
                await musicControlService.sendCommand(
                    buildCommand(guildId, userId, 'skip'),
                ),
            )
        }),
    )

    app.post(
        '/api/guilds/:guildId/music/stop',
        requireAuth,
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = param(req.params.guildId)
            const userId = requireUserId(req)
            res.json(
                await musicControlService.sendCommand(
                    buildCommand(guildId, userId, 'stop'),
                ),
            )
        }),
    )

    app.post(
        '/api/guilds/:guildId/music/volume',
        requireAuth,
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = param(req.params.guildId)
            const userId = requireUserId(req)
            const body = volumeBodySchema.safeParse(req.body)

            if (!body.success) {
                throw AppError.badRequest('Volume must be 0-100')
            }

            res.json(
                await musicControlService.sendCommand(
                    buildCommand(guildId, userId, 'volume', {
                        volume: body.data.volume,
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
            const userId = requireUserId(req)
            res.json(
                await musicControlService.sendCommand(
                    buildCommand(guildId, userId, 'shuffle'),
                ),
            )
        }),
    )

    app.post(
        '/api/guilds/:guildId/music/repeat',
        requireAuth,
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = param(req.params.guildId)
            const userId = requireUserId(req)
            const body = repeatBodySchema.safeParse(req.body)

            if (!body.success) {
                throw AppError.badRequest(
                    'Mode must be off, track, queue, or autoplay',
                )
            }

            res.json(
                await musicControlService.sendCommand(
                    buildCommand(guildId, userId, 'repeat', {
                        mode: body.data.mode,
                    }),
                ),
            )
        }),
    )

    app.post(
        '/api/guilds/:guildId/music/seek',
        requireAuth,
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = param(req.params.guildId)
            const userId = requireUserId(req)
            const body = seekBodySchema.safeParse(req.body)

            if (!body.success) {
                throw AppError.badRequest(
                    'Position must be a positive number (ms)',
                )
            }

            res.json(
                await musicControlService.sendCommand(
                    buildCommand(guildId, userId, 'seek', {
                        position: body.data.position,
                    }),
                ),
            )
        }),
    )
}
