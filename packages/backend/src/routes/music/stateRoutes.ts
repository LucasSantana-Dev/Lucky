import type { Express, Response } from 'express'
import { requireAuth, type AuthenticatedRequest } from '../../middleware/auth'
import { asyncHandler } from '../../middleware/asyncHandler'
import { musicControlService, type QueueState } from '@lucky/shared/services'
import { param, sseClients } from './helpers'

export function setupStateRoutes(app: Express): void {
    app.get(
        '/api/guilds/:guildId/music/stream',
        requireAuth,
        async (req: AuthenticatedRequest, res: Response) => {
            const guildId = param(req.params.guildId)

            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                Connection: 'keep-alive',
                'X-Accel-Buffering': 'no',
            })

            const currentState = await musicControlService.getState(guildId)
            if (currentState) {
                res.write(`data: ${JSON.stringify(currentState)}\n\n`)
            }

            if (!sseClients.has(guildId)) sseClients.set(guildId, new Set())
            sseClients.get(guildId)!.add(res)

            const heartbeat = setInterval(
                () => res.write(': heartbeat\n\n'),
                30000,
            )

            req.on('close', () => {
                clearInterval(heartbeat)
                sseClients.get(guildId)?.delete(res)
                if (sseClients.get(guildId)?.size === 0)
                    sseClients.delete(guildId)
            })
        },
    )

    app.get(
        '/api/guilds/:guildId/music/state',
        requireAuth,
        asyncHandler(async (req: AuthenticatedRequest, res: Response) => {
            const guildId = param(req.params.guildId)
            const state = await musicControlService.getState(guildId)
            res.json(state ?? emptyState(guildId))
        }),
    )
}

function emptyState(guildId: string): QueueState {
    return {
        guildId,
        currentTrack: null,
        tracks: [],
        isPlaying: false,
        isPaused: false,
        volume: 50,
        repeatMode: 'off',
        shuffled: false,
        position: 0,
        voiceChannelId: null,
        voiceChannelName: null,
        timestamp: Date.now(),
    }
}
