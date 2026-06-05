import { errorLog, infoLog } from '@lucky/shared/utils'
import { createClient, startClient } from '../../handlers/clientHandler'
import { createPlayer } from '../../handlers/playerHandler'
import { setCommands } from '../../handlers/commandsHandler'
import { getCommands } from '../../register'
import handleEvents from '../../handlers/eventHandler'
import {
    startMetricsServer,
    stopMetricsServer,
} from '../../utils/monitoring/metricsServer'
import type { CustomClient } from '../../types'
import { ConfigurationError } from '@lucky/shared/types'
import { redisClient } from '@lucky/shared/services'
import { initProviderHealth } from '../../utils/music/search/providerHealth'
import { musicWatchdogService } from '../../utils/music/watchdog'
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

    private async initializeRedisServices(
        options: BotInitializationOptions,
    ): Promise<void> {
        if (options.skipRedis !== true) {
            const connected = await redisClient.connect()
            if (!connected) {
                throw new ConfigurationError(
                    'Failed to initialize Redis services',
                )
            }
        }
    }

    private async createDiscordClient(): Promise<void> {
        try {
            this.client = await createClient()
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

            await this.initializeRedisServices(options)
            await initProviderHealth()
            await this.createDiscordClient()
            await this.initializePlayer(options)
            await this.setupCommands(options)
            this.setupEventHandlers(options)
            if (this.client) {
                await startClient({ client: this.client })
                startMetricsServer(this.client)
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
