import type { Express } from 'express'
import { musicControlService } from '@lukbot/shared/services'
import { infoLog, errorLog } from '@lukbot/shared/utils'
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
        await musicControlService.subscribeToResults()
        await musicControlService.subscribeToState((state) => {
            const clients = sseClients.get(state.guildId)
            if (!clients?.size) return
            const data = `data: ${JSON.stringify(state)}\n\n`
            for (const client of clients) {
                client.write(data)
            }
        })
        infoLog({ message: 'Music SSE bridge initialized' })
    } catch (error) {
        errorLog({ message: 'Failed to initialize music SSE bridge:', error })
    }
}
