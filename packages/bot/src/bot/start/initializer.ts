import { errorLog, infoLog, warnLog } from '@lucky/shared/utils'
import {
    createClient,
    startClient,
    stopPresenceRotation,
} from '../../handlers/clientHandler'
import { createPlayer } from '../../handlers/playerHandler'
import { setCommands, setContextMenus } from '../../handlers/commandsHandler'
import { getCommands, getContextMenus } from '../../register'
import handleEvents from '../../handlers/eventHandler'
import {
    startMetricsServer,
    stopMetricsServer,
} from '../../utils/monitoring/metricsServer'
import {
    setupWebMusicHandler,
    stopWebMusicHandler,
} from '../../handlers/webMusic'
import type { CustomClient } from '../../types'
import { ConfigurationError } from '@lucky/shared/types'
import { redisClient } from '@lucky/shared/services'
import { initProviderHealth } from '../../utils/music/search/providerHealth'
import { musicWatchdogService } from '../../utils/music/watchdog'
import { birthdayScheduler } from '../../utils/general/birthdayScheduler'
import { modDigestSchedulerService } from '../../utils/moderation/modDigestScheduler'
import { aiDevToolkitService } from '../../services/AiDevToolkitService'
import { dependencyCheckService } from '../../services/DependencyCheckService'
import { criativariaLiveNotificationService } from '../../services/CriativariaLiveNotificationService'
import { stopTwitchService } from '../../twitch'
import { stopBatchJobWorker } from '../../workers/batchJobWorker'
import { setClient } from '../clientStore'
import { stopRssBridgeService } from '../../services/RssBridgeService'
import type {
    BotInitializationOptions,
    BotInitializationResult,
    BotState,
} from './types'

/**
 * Bot initialization manager
 */
export class BotInitializer {
    private client: CustomClient | null = null
    private isInitialized = false
    private state: BotState = {
        isInitialized: false,
        isConnected: false,
        isReady: false,
    }

    private async initializeRedisServices(): Promise<void> {
        // Redis only backs music pub/sub plus legacy KV stores that already
        // degrade to fallbacks (ADR 2026-05-31-redis-scope-reduction). A dead
        // Redis must not stop the bot: MusicControlService reports unhealthy
        // and web music controls degrade instead (#1280).
        const connected = await redisClient.connect()
        if (!connected) {
            warnLog({
                message:
                    'Redis unavailable at startup — continuing in degraded mode (music pub/sub disabled, non-music features unaffected)',
            })
        }
    }

    private async createDiscordClient(): Promise<void> {
        try {
            this.client = await createClient()
            setClient(this.client)
        } catch (error) {
            errorLog({ message: 'Failed to create Discord client', error })
            throw new ConfigurationError('Failed to create Discord client')
        }
    }

    private async initializePlayer(
        options: BotInitializationOptions,
    ): Promise<void> {
        if (options.skipPlayer !== true && this.client) {
            const player = await createPlayer({ client: this.client })
            this.client.player = player
            musicWatchdogService.startOrphanSessionMonitor(player)
        }
    }

    private async setupCommands(
        options: BotInitializationOptions,
    ): Promise<void> {
        if (options.skipCommands !== true && this.client) {
            const commands = await getCommands()
            await setCommands({ client: this.client, commands })

            const contextMenus = await getContextMenus()
            await setContextMenus({ client: this.client, contextMenus })
        }
    }

    private setupEventHandlers(options: BotInitializationOptions): void {
        if (options.skipEvents !== true && this.client) {
            handleEvents(this.client)
        }
    }

    private setInitializationState(): void {
        this.isInitialized = true
        this.state = {
            isInitialized: true,
            isConnected: true,
            isReady: true,
            startTime: Date.now(),
        }
    }

    async initializeBot(
        options: BotInitializationOptions = {},
    ): Promise<BotInitializationResult> {
        if (this.isInitialized && this.client) {
            infoLog({
                message: 'Bot already initialized, skipping initialization',
            })
            return {
                success: true,
                client: this.client,
            }
        }

        try {
            infoLog({ message: 'Starting bot initialization...' })

            await this.initializeRedisServices()
            await initProviderHealth()
            await this.createDiscordClient()
            await this.initializePlayer(options)
            await this.setupCommands(options)
            this.setupEventHandlers(options)
            if (this.client) {
                await startClient({ client: this.client })
                startMetricsServer(this.client)
                await setupWebMusicHandler(this.client)
            }
            this.setInitializationState()

            infoLog({ message: 'Bot initialization completed successfully' })
            if (!this.client) {
                throw new Error('Client not initialized')
            }
            return {
                success: true,
                client: this.client,
            }
        } catch (error) {
            errorLog({ message: 'Bot initialization failed:', error })

            // Tear down any client that may have been created during this call.
            // Due to the early-return guard at function entry, any non-null
            // this.client here was necessarily created by this failed call.
            if (this.client) {
                try {
                    musicWatchdogService.stopOrphanSessionMonitor()
                    await this.shutdown()
                } catch (shutdownError) {
                    errorLog({
                        message:
                            'Error during cleanup after initialization failure:',
                        error: shutdownError,
                    })
                }
            }

            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            }
        }
    }

    getClient(): CustomClient | null {
        return this.client
    }

    getState(): BotState {
        return { ...this.state }
    }

    isBotInitialized(): boolean {
        return this.isInitialized
    }

    async shutdown(): Promise<void> {
        // Stop presence rotation first (following #1157 pattern)
        try {
            stopPresenceRotation()
        } catch (error) {
            errorLog({ message: 'Error stopping presence rotation:', error })
        }

        // Stop all long-lived timers/intervals
        try {
            stopWebMusicHandler()
        } catch (error) {
            errorLog({ message: 'Error stopping web music handler:', error })
        }

        try {
            birthdayScheduler.stop()
        } catch (error) {
            errorLog({ message: 'Error stopping birthday scheduler:', error })
        }

        try {
            modDigestSchedulerService.stop()
        } catch (error) {
            errorLog({ message: 'Error stopping mod digest scheduler:', error })
        }

        try {
            aiDevToolkitService.stop()
        } catch (error) {
            errorLog({
                message: 'Error stopping AI dev toolkit service:',
                error,
            })
        }

        try {
            dependencyCheckService.stop()
        } catch (error) {
            errorLog({
                message: 'Error stopping dependency check service:',
                error,
            })
        }

        try {
            criativariaLiveNotificationService.stop()
        } catch (error) {
            errorLog({
                message:
                    'Error stopping Criativaria live notification service:',
                error,
            })
        }

        try {
            stopTwitchService()
        } catch (error) {
            errorLog({ message: 'Error stopping Twitch service:', error })
        }

        try {
            await stopBatchJobWorker()
        } catch (error) {
            errorLog({
                message: 'Error stopping batch job worker:',
                error,
            })
        }

        try {
            stopRssBridgeService()
        } catch (error) {
            errorLog({
                message: 'Error stopping RSS Bridge service:',
                error,
            })
        }

        try {
            musicWatchdogService.stopOrphanSessionMonitor()
        } catch (error) {
            errorLog({
                message: 'Error stopping watchdog orphan-session monitor:',
                error,
            })
        }

        try {
            musicWatchdogService.stopPeriodicScan()
        } catch (error) {
            errorLog({
                message: 'Error stopping watchdog periodic scan:',
                error,
            })
        }

        if (this.client) {
            try {
                this.client.removeAllListeners()
                await this.client.destroy()
                infoLog({ message: 'Bot shutdown completed' })
            } catch (error) {
                errorLog({ message: 'Error during bot shutdown:', error })
            } finally {
                // Always clear the client + state, even if destroy() threw —
                // the client is being discarded, so leaving stale state would
                // block re-initialization.
                this.client = null
                this.isInitialized = false
                this.state = {
                    isInitialized: false,
                    isConnected: false,
                    isReady: false,
                }
            }
        }
        try {
            await stopMetricsServer()
        } catch (error) {
            errorLog({ message: 'Error stopping metrics server:', error })
        }
    }
}
