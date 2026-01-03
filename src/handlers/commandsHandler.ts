import { Collection, type ChatInputCommandInteraction } from 'discord.js'
import { errorLog, debugLog } from '../utils/general/log'
import type { CustomClient } from '../types'
import type Command from '../models/Command'
import { interactionReply } from '../utils/general/interactionReply'
import { monitorCommandExecution } from '../utils/monitoring'
import { createUserFriendlyError } from '../utils/general/errorSanitizer'

type ExecuteCommandParams = {
    interaction: ChatInputCommandInteraction
    client: CustomClient
}

type SetCommandsParams = {
    client: CustomClient
    commands: Command[]
}

type GroupCommandsParams = {
    commands: Command[]
}

export const executeCommand = async ({
    interaction,
    client,
}: ExecuteCommandParams): Promise<void> => {
    monitorCommandExecution(
        interaction.commandName,
        interaction.user.id,
        interaction.guild?.id,
    )

    try {
        const command = client.commands.get(interaction.commandName)
        if (!command) {
            debugLog({
                message: `Command not found: ${interaction.commandName}`,
            })
            return
        }

        debugLog({ message: `Executing command: ${interaction.commandName}` })
        await command.execute({ interaction, client })
    } catch (error) {
        errorLog({
            message: `Error executing command ${interaction.commandName}:`,
            error,
        })
        try {
            const userFriendlyError = createUserFriendlyError(error)
            await interactionReply({
                interaction,
                content: {
                    content: userFriendlyError,
                    ephemeral: true,
                },
            })
        } catch (error) {
            errorLog({ message: 'Error sending error message:', error })
        }
    }
}

export async function setCommands({
    client,
    commands,
}: SetCommandsParams): Promise<void> {
    try {
        debugLog({ message: 'Setting commands in client collection...' })

        client.commands = new Collection()

        for (const command of commands) {
            if (command.data.name) {
                client.commands.set(command.data.name, command)
            }
        }

        debugLog({ message: `Loaded ${client.commands.size} commands` })
    } catch (error) {
        errorLog({ message: 'Error setting commands:', error })
        throw error
    }
}

export const groupCommands = ({ commands }: GroupCommandsParams): Command[] => {
    try {
        const validCommands = commands.filter((cmd) => {
            if (!cmd?.data?.name || !cmd?.execute) {
                errorLog({
                    message: `Invalid command found during grouping: ${cmd?.data?.name || 'unknown'}`,
                })
                return false
            }
            return true
        })

        return validCommands
    } catch (error) {
        errorLog({ message: 'Error grouping commands:', error })
        return []
    }
}
