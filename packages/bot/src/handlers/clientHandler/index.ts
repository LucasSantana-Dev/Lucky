import { createClient as createClientFunc, startClient as startClientFunc } from './service'
import type { CustomClient } from '../../types'
import type {
    StartClientParams,
    MapGuildIdsParams,
    CreateClientOptions,
    RegisterCommandsOptions,
} from './types'
import type Command from '../../models/Command'

export const createClient = createClientFunc
export const startClient = startClientFunc

export const registerCommands = async (
    options: RegisterCommandsOptions,
): Promise<void> => {
    const { commands, token, clientId } = options
    const { REST, Routes } = await import('discord.js')
    const rest = new REST({ version: '10' }).setToken(token)
    const commandsData = Array.from(commands).map((cmd: Command) => cmd.data.toJSON())
    await rest.put(Routes.applicationCommands(clientId), {
        body: commandsData,
    })
}

export const mapGuildIds = async (_params: MapGuildIdsParams): Promise<void> => {
    // Implementation can be added if needed
}

export type {
    StartClientParams,
    MapGuildIdsParams,
    CreateClientOptions,
    RegisterCommandsOptions,
}
