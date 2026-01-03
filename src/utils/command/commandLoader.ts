import fs from 'fs'
import path from 'path'
import { errorLog, infoLog, debugLog } from '../general/log'
import Command from '../../models/Command'

function getAbsolutePath(directoryPath: string): string {
    const absolutePath = path.isAbsolute(directoryPath)
        ? directoryPath
        : path.resolve(directoryPath)
    debugLog({ message: `Absolute path: ${absolutePath}` })
    return absolutePath
}

function validateDirectory(absolutePath: string): boolean {
    if (!fs.existsSync(absolutePath)) {
        errorLog({ message: `Directory does not exist: ${absolutePath}` })
        return false
    }
    return true
}

function getCommandFiles(absolutePath: string): string[] {
    const commandFiles = fs
        .readdirSync(absolutePath)
        .filter(
            (file) =>
                (file.endsWith('.js') || file.endsWith('.ts')) &&
                !file.endsWith('.d.ts'),
        )

    debugLog({
        message: `Found ${commandFiles.length} command files in ${absolutePath}`,
    })

    return commandFiles
}

function filterIndexFiles(commandFiles: string[]): string[] {
    const filteredCommandFiles = commandFiles.filter(
        (file) => file !== 'index.ts' && file !== 'index',
    )

    debugLog({
        message: `Filtered to ${filteredCommandFiles.length} command files (excluding index files)`,
    })

    return filteredCommandFiles
}

async function loadCommandFromFile(
    filePath: string,
    file: string,
): Promise<Command | null> {
    try {
        debugLog({ message: `Loading command from: ${filePath}` })

        const commandModule = await import(filePath) as { default?: Command; command?: Command }
        const command = commandModule.default ?? commandModule.command

        if (command instanceof Command) {
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

        if (!validateDirectory(absolutePath)) {
            return []
        }

        const commandFiles = getCommandFiles(absolutePath)
        const filteredCommandFiles = filterIndexFiles(commandFiles)

        const commands: Command[] = []
        for (const file of filteredCommandFiles) {
            const filePath = path.join(absolutePath, file)
            const command = await loadCommandFromFile(filePath, file)

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
