import type { Express, Response } from 'express'
import { errorLog } from '@lukbot/shared/utils'
import { requireAuth, type AuthenticatedRequest } from '../../middleware/auth'
import { musicControlService } from '@lukbot/shared/services'
import { param, buildCommand } from './helpers'

export function setupPlaybackRoutes(app: Express): void {
    app.post(
        '/api/guilds/:guildId/music/play',
        requireAuth,
        async (req: AuthenticatedRequest, res: Response) => {
            try {
                const guildId = param(req.params.guildId)
                const { query, voiceChannelId } = req.body
                if (!query)
                    return res.status(400).json({ error: 'Query is required' })

                const cmd = buildCommand(guildId, req.userId!, 'play', {
                    query,
                    voiceChannelId,
                })
                res.json(await musicControlService.sendCommand(cmd))
            } catch (error) {
                errorLog({ message: 'Error sending play command:', error })
                res.status(500).json({ error: 'Failed to send play command' })
            }
        },
    )

    app.post(
        '/api/guilds/:guildId/music/pause',
        requireAuth,
        async (req: AuthenticatedRequest, res: Response) => {
            try {
                const guildId = param(req.params.guildId)
                res.json(
                    await musicControlService.sendCommand(
                        buildCommand(guildId, req.userId!, 'pause'),
                    ),
                )
            } catch (error) {
                errorLog({ message: 'Error sending pause command:', error })
                res.status(500).json({ error: 'Failed to send pause command' })
            }
        },
    )

    app.post(
        '/api/guilds/:guildId/music/resume',
        requireAuth,
        async (req: AuthenticatedRequest, res: Response) => {
            try {
                const guildId = param(req.params.guildId)
                res.json(
                    await musicControlService.sendCommand(
                        buildCommand(guildId, req.userId!, 'resume'),
                    ),
                )
            } catch (error) {
                errorLog({ message: 'Error sending resume command:', error })
                res.status(500).json({ error: 'Failed to send resume command' })
            }
        },
    )

    app.post(
        '/api/guilds/:guildId/music/skip',
        requireAuth,
        async (req: AuthenticatedRequest, res: Response) => {
            try {
                const guildId = param(req.params.guildId)
                res.json(
                    await musicControlService.sendCommand(
                        buildCommand(guildId, req.userId!, 'skip'),
                    ),
                )
            } catch (error) {
                errorLog({ message: 'Error sending skip command:', error })
                res.status(500).json({ error: 'Failed to send skip command' })
            }
        },
    )

    app.post(
        '/api/guilds/:guildId/music/stop',
        requireAuth,
        async (req: AuthenticatedRequest, res: Response) => {
            try {
                const guildId = param(req.params.guildId)
                res.json(
                    await musicControlService.sendCommand(
                        buildCommand(guildId, req.userId!, 'stop'),
                    ),
                )
            } catch (error) {
                errorLog({ message: 'Error sending stop command:', error })
                res.status(500).json({ error: 'Failed to send stop command' })
            }
        },
    )

    app.post(
        '/api/guilds/:guildId/music/volume',
        requireAuth,
        async (req: AuthenticatedRequest, res: Response) => {
            try {
                const guildId = param(req.params.guildId)
                const { volume } = req.body
                if (typeof volume !== 'number' || volume < 0 || volume > 100) {
                    return res
                        .status(400)
                        .json({ error: 'Volume must be 0-100' })
                }
                res.json(
                    await musicControlService.sendCommand(
                        buildCommand(guildId, req.userId!, 'volume', {
                            volume,
                        }),
                    ),
                )
            } catch (error) {
                errorLog({ message: 'Error sending volume command:', error })
                res.status(500).json({ error: 'Failed to send volume command' })
            }
        },
    )

    app.post(
        '/api/guilds/:guildId/music/shuffle',
        requireAuth,
        async (req: AuthenticatedRequest, res: Response) => {
            try {
                const guildId = param(req.params.guildId)
                res.json(
                    await musicControlService.sendCommand(
                        buildCommand(guildId, req.userId!, 'shuffle'),
                    ),
                )
            } catch (error) {
                errorLog({ message: 'Error sending shuffle command:', error })
                res.status(500).json({
                    error: 'Failed to send shuffle command',
                })
            }
        },
    )

    app.post(
        '/api/guilds/:guildId/music/repeat',
        requireAuth,
        async (req: AuthenticatedRequest, res: Response) => {
            try {
                const guildId = param(req.params.guildId)
                const { mode } = req.body
                if (!['off', 'track', 'queue'].includes(mode)) {
                    return res
                        .status(400)
                        .json({ error: 'Mode must be off, track, or queue' })
                }
                res.json(
                    await musicControlService.sendCommand(
                        buildCommand(guildId, req.userId!, 'repeat', { mode }),
                    ),
                )
            } catch (error) {
                errorLog({ message: 'Error sending repeat command:', error })
                res.status(500).json({ error: 'Failed to send repeat command' })
            }
        },
    )

    app.post(
        '/api/guilds/:guildId/music/seek',
        requireAuth,
        async (req: AuthenticatedRequest, res: Response) => {
            try {
                const guildId = param(req.params.guildId)
                const { position } = req.body
                if (typeof position !== 'number' || position < 0) {
                    return res.status(400).json({
                        error: 'Position must be a positive number (ms)',
                    })
                }
                res.json(
                    await musicControlService.sendCommand(
                        buildCommand(guildId, req.userId!, 'seek', {
                            position,
                        }),
                    ),
                )
            } catch (error) {
                errorLog({ message: 'Error seeking:', error })
                res.status(500).json({ error: 'Failed to seek' })
            }
        },
    )
}
