import { getCommandsFromDirectory } from '../../../utils/command/getCommandsFromDirectory'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { debugLog, errorLog } from '@lucky/shared/utils'

async function getAutoModCommands() {
    try {
        debugLog({ message: 'Loading automod commands...' })
        const dirName = path.dirname(fileURLToPath(import.meta.url))
        const commandsPath = dirName

        return await getCommandsFromDirectory({
            url: commandsPath,
            category: 'automod',
        })
    } catch (error) {
        errorLog({ message: 'Error loading automod commands:', error })
        return []
    }
}

export default getAutoModCommands
