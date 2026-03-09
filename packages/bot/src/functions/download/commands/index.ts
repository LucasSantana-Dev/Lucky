import { getCommandsFromDirectory } from '../../../utils/command/getCommandsFromDirectory'
import path from 'path'
import { fileURLToPath } from 'url'
import { debugLog, errorLog } from '@lucky/shared/utils'

async function getDownloadCommands() {
    try {
        debugLog({ message: 'Loading download commands...' })
        const dirName = path.dirname(fileURLToPath(import.meta.url))
        const commandsPath = dirName
        const commands = await getCommandsFromDirectory({
            url: commandsPath,
            category: 'download',
        })

        return commands
    } catch (error) {
        errorLog({ message: 'Error loading download commands:', error })
        return []
    }
}

export default getDownloadCommands
