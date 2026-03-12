import { getCommandsFromDirectory } from '../../../utils/command/getCommandsFromDirectory'
import path from 'path'
import { fileURLToPath } from 'url'
import { debugLog, errorLog } from '@lucky/shared/utils'

async function getManagementCommands() {
    try {
        debugLog({ message: 'Loading management commands...' })
        const dirName = path.dirname(fileURLToPath(import.meta.url))
        const commandsPath = dirName
        return await getCommandsFromDirectory({
            url: commandsPath,
            category: 'management',
            excludePatterns: [/\\.spec\\./, /\\.test\\./],
        })
    } catch (error) {
        errorLog({ message: 'Error loading management commands:', error })
        return []
    }
}

export default getManagementCommands
export { default as customcommand } from './customcommand.js'
export { default as embed } from './embed.js'
export { default as automessage } from './automessage.js'
export { default as serversetup } from './serversetup.js'
