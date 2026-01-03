import fs from 'fs'
import path from 'path'
import { errorLog, infoLog, debugLog } from '../general/log'
import type Command from '../../models/Command'

/**
 * Get absolute path from directory path
 */
function getAbsolutePath(directoryPath: string): string {
    return path.isAbsolute(directoryPath)
        ? directoryPath
        : path.resolve(directoryPath)
}

/**
 * Get command files from directory
 */
function getCommandFiles(absolutePath: string): string[] {
    const isProd = process.env.NODE_ENV === 'production'
    const fileExt = isProd ? '.js' : '.ts'

    return fs
        .readdirSync(absolutePath)
        .filter((file) => file.endsWith(fileExt) && !file.startsWith('index.'))
}

/**
 * Validate command object
 */
function isValidCommand(command: unknown): command is Command {
    return (
        command !== null &&
        command !== undefined &&
        typeof command === 'object' &&
        typeof (command as Command).data === 'object' &&
        typeof (command as Command).execute === 'function'
    )
}

/**
 * Load command from file
 */
async function loadCommandFromFile(
    file: string,
    absolutePath: string,
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

export async function loadCommandsFromDir(
    directoryPath: string,
): Promise<Command[]> {
    try {
        debugLog({ message: `Reading directory: ${directoryPath}` })

        const absolutePath = getAbsolutePath(directoryPath)
        debugLog({ message: `Absolute path: ${absolutePath}` })

        // Check if directory exists
        if (!fs.existsSync(absolutePath)) {
            errorLog({ message: `Directory does not exist: ${absolutePath}` })
            return []
        }

        const commandFiles = getCommandFiles(absolutePath)
        debugLog({
            message: `Found ${commandFiles.length} command files in ${absolutePath}`,
        })

        // Load commands
        const commands: Command[] = []
        for (const file of commandFiles) {
            const command = await loadCommandFromFile(file, absolutePath)
            if (command) {
                commands.push(command)
            }
        }

        infoLog({
            message: `Successfully loaded ${commands.length} commands from ${absolutePath}`,
        })
        return commands
    } catch (error) {
        errorLog({ message: 'Error getting commands from directory:', error })
        return []
    }
}
