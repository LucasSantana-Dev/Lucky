import type { Express, Response } from 'express'
import { requireAuth, type AuthenticatedRequest } from '../../middleware/auth'
import { requireGuildModuleAccess } from '../../middleware/guildAccess'
import { asyncHandler } from '../../middleware/asyncHandler'
import { validateParams } from '../../middleware/validate'
import { guildIdParam } from '../../schemas/common'
import { musicControlService, type QueueState } from '@lucky/shared/services'
import { param, sseClients, sseStreamCounts } from './helpers'

const MAX_STREAMS_PER_USER_GUILD = 3
const HEARTBEAT_INTERVAL_MS = 30000

export function setupStateRoutes(app: Express): void {
    app.get(
        '/api/guilds/:guildId/music/stream',
        requireAuth,
        requireGuildModuleAccess('music', 'view'),
        validateParams(guildIdParam),
        async (req: AuthenticatedRequest, res: Response) => {
            // The client may have left during the async auth middleware, before
            // a close listener existed here; do not reserve a slot for it.
            if (req.destroyed || res.destroyed || res.writableEnded) return

            const guildId = param(req.params.guildId)
            const capKey = `${req.userId ?? req.sessionId}:${guildId}`
            const openStreams = sseStreamCounts.get(capKey) ?? 0
            if (openStreams >= MAX_STREAMS_PER_USER_GUILD) {
                res.status(429).json({ error: 'Too many open music streams' })
                return
            }
            sseStreamCounts.set(capKey, openStreams + 1)

            let closed = false
            let heartbeat: ReturnType<typeof setInterval> | null = null

            // Registered before any await so a client that disconnects during
            // the state lookup is still cleaned up and never gets a heartbeat.
            const cleanup = () => {
                if (closed) return
                closed = true
                if (heartbeat) clearInterval(heartbeat)
                heartbeat = null

                const remaining = (sseStreamCounts.get(capKey) ?? 1) - 1
                if (remaining > 0) sseStreamCounts.set(capKey, remaining)
                else sseStreamCounts.delete(capKey)

                const guildClients = sseClients.get(guildId)
                guildClients?.delete(res)
                if (guildClients?.size === 0) sseClients.delete(guildId)
            }
            req.on('close', cleanup)

            const send = (payload: unknown): boolean => {
                if (closed || res.writableEnded || res.destroyed) return false
                try {
                    res.write(`data: ${JSON.stringify(payload)}\n\n`)
                    return true
                } catch {
                    // NOSONAR: client went away mid-write; release everything now.
                    cleanup()
                    return false
                }
            }

            res.writeHead(200, {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                Connection: 'keep-alive',
                'X-Accel-Buffering': 'no',
            })

            let currentState: QueueState | null
            try {
                currentState = await musicControlService.getState(guildId)
            } catch {
                // NOSONAR: headers are already sent, so end the stream instead of a 500.
                cleanup()
                res.end()
                return
            }

            if (closed) return
            if (currentState && !send(currentState)) return

            let clients = sseClients.get(guildId)
            if (!clients) {
                clients = new Set()
                sseClients.set(guildId, clients)
            }
            clients.add(res)

            heartbeat = setInterval(
                () => send({ type: 'heartbeat' }),
                HEARTBEAT_INTERVAL_MS,
            )
        },
    )

    app.get(
        '/api/guilds/:guildId/music/state',
        requireAuth,
        requireGuildModuleAccess('music', 'view'),
        validateParams(guildIdParam),
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
