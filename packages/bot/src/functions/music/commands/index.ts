import { getCommandsFromDirectory } from '../../../utils/command/getCommandsFromDirectory'
import path from 'path'
import { fileURLToPath } from 'url'
import { debugLog, errorLog } from '@lucky/shared/utils'

async function getMusicCommands() {
    try {
        debugLog({ message: 'Loading music commands...' })
        const dirName = path.dirname(fileURLToPath(import.meta.url))
        const commandsPath = dirName
        const commands = await getCommandsFromDirectory({
            url: commandsPath,
            category: 'music',
        })

        return commands
    } catch (error) {
        errorLog({ message: 'Error loading music commands:', error })
        return []
    }
}

export default getMusicCommands
