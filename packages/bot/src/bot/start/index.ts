import { BotInitializer } from './initializer'
import type {
    BotInitializationOptions,
    BotInitializationResult,
    BotState,
} from './types'

/**
 * Main bot startup service
 */
export class BotStartService {
    private readonly initializer: BotInitializer

    constructor() {
        this.initializer = new BotInitializer()
    }

    async initializeBot(
        options?: BotInitializationOptions,
    ): Promise<BotInitializationResult> {
        return this.initializer.initializeBot(options)
    }

    getClient() {
        return this.initializer.getClient()
    }

    getState(): BotState {
        return this.initializer.getState()
    }

    isBotInitialized(): boolean {
        return this.initializer.isBotInitialized()
    }

    async shutdown(): Promise<void> {
        return this.initializer.shutdown()
    }
}

export const botStartService = new BotStartService()

export const initializeBot = async (
    options?: BotInitializationOptions,
): Promise<BotInitializationResult> => {
    return botStartService.initializeBot(options)
}

export const getClient = () => {
    return botStartService.getClient()
}

export const getState = (): BotState => {
    return botStartService.getState()
}

export const isBotInitialized = (): boolean => {
    return botStartService.isBotInitialized()
}

export const shutdown = async (): Promise<void> => {
    return botStartService.shutdown()
}

export type { BotInitializationOptions, BotInitializationResult, BotState }
