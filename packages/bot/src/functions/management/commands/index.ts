import { getCommandsFromDirectory } from '../../../utils/command/getCommandsFromDirectory'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { debugLog, errorLog } from '@lucky/shared/utils'

async function getManagementCommands() {
    try {
        debugLog({ message: 'Loading management commands...' })
        const dirName = path.dirname(fileURLToPath(import.meta.url))
        const commandsPath = dirName

        return await getCommandsFromDirectory({
            url: commandsPath,
            category: 'management',
        })
    } catch (error) {
        errorLog({ message: 'Error loading management commands:', error })
        return []
    }
}

export default getManagementCommands
