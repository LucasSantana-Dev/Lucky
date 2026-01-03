import { ClientHandlerService } from './service'
import type { CustomClient } from '../../types/index'
import type {
    StartClientParams,
    MapGuildIdsParams,
    CreateClientOptions,
    RegisterCommandsOptions,
} from './types'

/**
 * Main client handler service
 */
export class ClientHandler {
    private readonly service: ClientHandlerService

    constructor() {
        this.service = new ClientHandlerService()
    }

    async createClient(): Promise<CustomClient> {
        return this.service.createClient()
    }

    async startClient(params: StartClientParams): Promise<void> {
        return this.service.startClient(params)
    }

    async registerCommands(options: RegisterCommandsOptions): Promise<void> {
        return this.service.registerCommands(options)
    }

    async mapGuildIds(params: MapGuildIdsParams): Promise<void> {
        return this.service.mapGuildIds(params)
    }
}

export const clientHandler = new ClientHandler()

export const createClient = async (): Promise<CustomClient> => {
    return clientHandler.createClient()
}

export const startClient = async (params: StartClientParams): Promise<void> => {
    return clientHandler.startClient(params)
}

export const registerCommands = async (
    options: RegisterCommandsOptions,
): Promise<void> => {
    return clientHandler.registerCommands(options)
}

export const mapGuildIds = async (params: MapGuildIdsParams): Promise<void> => {
    return clientHandler.mapGuildIds(params)
}

export type {
    StartClientParams,
    MapGuildIdsParams,
    CreateClientOptions,
    RegisterCommandsOptions,
}
