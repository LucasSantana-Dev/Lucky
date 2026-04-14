import type { Express } from 'express'
import { musicControlService } from '@lucky/shared/services'
import { infoLog, errorLog } from '@lucky/shared/utils'
import { setupPlaybackRoutes } from './playbackRoutes'
import { setupQueueRoutes } from './queueRoutes'
import { setupStateRoutes } from './stateRoutes'
import { sseClients } from './helpers'

export function setupMusicRoutes(app: Express): void {
    setupPlaybackRoutes(app)
    setupQueueRoutes(app)
    setupStateRoutes(app)
    initMusicSSEBridge()
}

async function initMusicSSEBridge(): Promise<void> {
    try {
        await musicControlService.connect()
        infoLog({ message: 'Music SSE bridge: musicControlService connected' })

        await musicControlService.subscribeToResults()
        infoLog({ message: 'Music SSE bridge: subscribed to command results' })

        await musicControlService.subscribeToState((state) => {
            const clients = sseClients.get(state.guildId)
            if (!clients?.size) return
            const data = `data: ${JSON.stringify(state)}\n\n`
            let written = 0
            for (const client of clients) {
                try {
                    client.write(data)
                    written++
                } catch (err) {
                    errorLog({
                        message: 'Failed to write to SSE client',
                        error: err,
                    })
                }
            }
            if (written > 0) {
                infoLog({
                    message: `Music state broadcast to ${written} clients for guild ${state.guildId}`,
                })
            }
        })
        infoLog({ message: 'Music SSE bridge initialized successfully' })
    } catch (error) {
        errorLog({ message: 'Failed to initialize music SSE bridge:', error })
    }
}
