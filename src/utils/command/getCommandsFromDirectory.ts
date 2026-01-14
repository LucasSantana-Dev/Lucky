import fs from 'fs'
import path from 'path'
import { errorLog, debugLog, infoLog } from '../general/log'
import type Command from '../../../packages/bot/src/models/Command'
import { config } from '../../config/config'

type GetCommandsParams = {
    url: string
    category?: string
}

function isCategoryDisabled(category: string | undefined): boolean {
    if (!category) return false
    const { COMMAND_CATEGORIES_DISABLED } = config()
    return COMMAND_CATEGORIES_DISABLED.includes(category)
}

function validateDirectoryPath(url: string): string | null {
    const absolutePath = path.isAbsolute(url) ? url : path.resolve(url)
    if (!fs.existsSync(absolutePath)) {
        errorLog({ message: `Directory does not exist: ${absolutePath}` })
        return null
    }
    return absolutePath
}

function getCommandFiles(absolutePath: string): string[] {
    const isProd = process.env.NODE_ENV === 'production'

    const files = fs
        .readdirSync(absolutePath)
        .filter(
            (file) =>
                (file.endsWith('.js') || file.endsWith('.ts')) &&
                !file.endsWith('.d.ts') &&
                !file.startsWith('index.'),
        )

    if (isProd) {
        return files.filter((file) => file.endsWith('.js'))
    }

    return files.filter((file) => file.endsWith('.ts'))
}

function isValidCommand(command: unknown): command is Command {
    return (
        command !== null &&
        command !== undefined &&
        typeof command === 'object' &&
        'data' in command &&
        typeof command.data === 'object' &&
        'execute' in command &&
        typeof command.execute === 'function'
    )
}

async function loadCommandFromFile(
    absolutePath: string,
    file: string,
): Promise<Command | null> {
    try {
        const filePath = path.join(absolutePath, file)
        debugLog({ message: `Loading command from: ${filePath}` })

        const isProd = process.env.NODE_ENV === 'production'
        let commandModule
        if (isProd) {
            const fileUrl = `file://${filePath}`
            commandModule = await import(fileUrl) as { default?: Command; command?: Command }
        } else {
            commandModule = await import(filePath) as { default?: Command; command?: Command }
        }

        const command = commandModule.default ?? commandModule.command

        if (isValidCommand(command)) {
            debugLog({
                message: `Successfully loaded command: ${command.data.name} from ${file}`,
            })
            return command
        } else {
            errorLog({
                message: `Command in ${file} is not a valid Command instance`,
            })
            return null
        }
    } catch (error) {
        errorLog({
            message: `Error loading command from ${file}:`,
            error,
        })
        return null
    }
}

function filterDisabledCommands(commands: Command[]): Command[] {
    const { COMMANDS_DISABLED } = config()
    return commands.filter((cmd) => !COMMANDS_DISABLED.includes(cmd.data.name))
}

export const getCommandsFromDirectory = async ({
    url,
    category,
}: GetCommandsParams): Promise<Command[]> => {
    try {
        debugLog({ message: `Reading directory: ${url}` })

        if (isCategoryDisabled(category)) {
            debugLog({
                message: `Category '${category}' is disabled via config. Skipping load.`,
            })
            return []
        }

        const absolutePath = validateDirectoryPath(url)
        if (!absolutePath) return []

        debugLog({ message: `Absolute path: ${absolutePath}` })

        const commandFiles = getCommandFiles(absolutePath)
        debugLog({
            message: `Found ${commandFiles.length} command files in ${absolutePath}`,
        })

        const commands: Command[] = []
        for (const file of commandFiles) {
            const command = await loadCommandFromFile(absolutePath, file)
            if (command) {
                commands.push(command)
            }
        }

        const filteredCommands = filterDisabledCommands(commands)
        if (filteredCommands.length !== commands.length) {
            debugLog({
                message: `Filtered out ${commands.length - filteredCommands.length} disabled commands from ${absolutePath}`,
            })
        }

        infoLog({
            message: `Successfully loaded ${filteredCommands.length} commands from ${absolutePath}`,
        })

        return filteredCommands
    } catch (error) {
        errorLog({ message: 'Error getting commands from directory:', error })
        return []
    }
}
