import { getCommandsFromDirectory } from '../../../utils/command/getCommandsFromDirectory'
import path from 'path'
import { fileURLToPath } from 'url'
import { debugLog, errorLog } from '@lucky/shared/utils'

async function getGeneralCommands() {
    try {
        debugLog({ message: 'Loading general commands...' })
        const dirName = path.dirname(fileURLToPath(import.meta.url))
        const commandsPath = dirName
        const commands = await getCommandsFromDirectory({
            url: commandsPath,
            category: 'general',
        })

        return commands
    } catch (error) {
        errorLog({ message: 'Error loading general commands:', error })
        return []
    }
}

export default getGeneralCommands
