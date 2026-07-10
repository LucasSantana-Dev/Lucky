import type {
    StartClientParams,
    CreateClientOptions,
    RegisterCommandsOptions,
} from './types'
import type Command from '../../models/Command'

export const registerCommands = async (
    options: RegisterCommandsOptions,
): Promise<void> => {
    const { commands, token, clientId } = options
    const { REST, Routes } = await import('discord.js')
    const rest = new REST({ version: '10' }).setToken(token)
    const commandsData = Array.from(commands).map((cmd: Command) =>
        cmd.data.toJSON(),
    )
    await rest.put(Routes.applicationCommands(clientId), {
        body: commandsData,
    })
}

export type { StartClientParams, CreateClientOptions, RegisterCommandsOptions }
