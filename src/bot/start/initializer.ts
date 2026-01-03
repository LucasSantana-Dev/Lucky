import { errorLog, infoLog } from '../../utils/general/log'
import { createClient, startClient } from '../../handlers/clientHandler'
import { createPlayer } from '../../handlers/playerHandler'
import { setCommands } from '../../handlers/commandsHandler'
import { getCommands } from '../../utils/command/commands'
import handleEvents from '../../handlers/eventHandler'
import type { CustomClient } from '../../types'
import { ConfigurationError } from '../../types/errors/system'
import { redisInitializationService } from '../../services/RedisInitializationService'
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
            const redisInitialized =
                await redisInitializationService.initialize()
            if (!redisInitialized) {
                throw new ConfigurationError(
                    'Failed to initialize Redis services',
                )
            }
        }
    }

    private async createDiscordClient(): Promise<void> {
        try {
            this.client = await createClient()
        } catch (_error) {
            throw new ConfigurationError('Failed to create Discord client')
        }
    }

    private async initializePlayer(
        options: BotInitializationOptions,
    ): Promise<void> {
        if (options.skipPlayer !== true && this.client) {
            const player = await createPlayer({ client: this.client })
            this.client.player = player
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
            await this.createDiscordClient()
            await this.initializePlayer(options)
            await this.setupCommands(options)
            this.setupEventHandlers(options)
            if (this.client) {
                await startClient({ client: this.client })
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
                await this.client.destroy()
                this.client = null
                this.isInitialized = false
                this.state = {
                    isInitialized: false,
                    isConnected: false,
                    isReady: false,
                }
                infoLog({ message: 'Bot shutdown completed' })
            } catch (error) {
                errorLog({ message: 'Error during bot shutdown:', error })
            }
        }
    }
}
