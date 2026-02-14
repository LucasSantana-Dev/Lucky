import type { Express, Response } from 'express'
import { errorLog } from '@lukbot/shared/utils'
import { requireAuth, type AuthenticatedRequest } from '../../middleware/auth'
import { musicControlService } from '@lukbot/shared/services'
import { param, buildCommand } from './helpers'

export function setupQueueRoutes(app: Express): void {
    app.get(
        '/api/guilds/:guildId/music/queue',
        requireAuth,
        async (req: AuthenticatedRequest, res: Response) => {
            try {
                const guildId = param(req.params.guildId)
                const state = await musicControlService.getState(guildId)
                res.json({
                    currentTrack: state?.currentTrack ?? null,
                    tracks: state?.tracks ?? [],
                    total: state?.tracks.length ?? 0,
                })
            } catch (error) {
                errorLog({ message: 'Error fetching queue:', error })
                res.status(500).json({ error: 'Failed to fetch queue' })
            }
        },
    )

    app.post(
        '/api/guilds/:guildId/music/queue/move',
        requireAuth,
        async (req: AuthenticatedRequest, res: Response) => {
            try {
                const guildId = param(req.params.guildId)
                const { from, to } = req.body
                if (typeof from !== 'number' || typeof to !== 'number') {
                    return res
                        .status(400)
                        .json({ error: 'From and to positions are required' })
                }
                const cmd = buildCommand(guildId, req.userId!, 'queue_move', {
                    from,
                    to,
                })
                res.json(await musicControlService.sendCommand(cmd))
            } catch (error) {
                errorLog({ message: 'Error moving queue track:', error })
                res.status(500).json({ error: 'Failed to move queue track' })
            }
        },
    )

    app.post(
        '/api/guilds/:guildId/music/queue/remove',
        requireAuth,
        async (req: AuthenticatedRequest, res: Response) => {
            try {
                const guildId = param(req.params.guildId)
                const { index } = req.body
                if (typeof index !== 'number') {
                    return res
                        .status(400)
                        .json({ error: 'Track index is required' })
                }
                const cmd = buildCommand(guildId, req.userId!, 'queue_remove', {
                    index,
                })
                res.json(await musicControlService.sendCommand(cmd))
            } catch (error) {
                errorLog({ message: 'Error removing queue track:', error })
                res.status(500).json({ error: 'Failed to remove queue track' })
            }
        },
    )

    app.post(
        '/api/guilds/:guildId/music/queue/clear',
        requireAuth,
        async (req: AuthenticatedRequest, res: Response) => {
            try {
                const guildId = param(req.params.guildId)
                res.json(
                    await musicControlService.sendCommand(
                        buildCommand(guildId, req.userId!, 'queue_clear'),
                    ),
                )
            } catch (error) {
                errorLog({ message: 'Error clearing queue:', error })
                res.status(500).json({ error: 'Failed to clear queue' })
            }
        },
    )

    app.post(
        '/api/guilds/:guildId/music/import',
        requireAuth,
        async (req: AuthenticatedRequest, res: Response) => {
            try {
                const guildId = param(req.params.guildId)
                const { url, voiceChannelId } = req.body
                if (!url)
                    return res
                        .status(400)
                        .json({ error: 'Playlist URL is required' })

                const cmd = buildCommand(
                    guildId,
                    req.userId!,
                    'import_playlist',
                    { url, voiceChannelId },
                )
                res.json(await musicControlService.sendCommand(cmd, 30000))
            } catch (error) {
                errorLog({ message: 'Error importing playlist:', error })
                res.status(500).json({ error: 'Failed to import playlist' })
            }
        },
    )
}
