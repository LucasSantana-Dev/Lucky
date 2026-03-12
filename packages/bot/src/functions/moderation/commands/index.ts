import { getCommandsFromDirectory } from '../../../utils/command/getCommandsFromDirectory'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { debugLog, errorLog } from '@lucky/shared/utils'

async function getModerationCommands() {
    try {
        debugLog({ message: 'Loading moderation commands...' })
        const dirName = path.dirname(fileURLToPath(import.meta.url))
        const commandsPath = dirName
        return await getCommandsFromDirectory({
            url: commandsPath,
            category: 'moderation',
        })
    } catch (error) {
        errorLog({ message: 'Error loading moderation commands:', error })
        return []
    }
}

export default getModerationCommands
export { default as warn } from './warn.js'
export { default as mute } from './mute.js'
export { default as unmute } from './unmute.js'
export { default as kick } from './kick.js'
export { default as ban } from './ban.js'
export { default as unban } from './unban.js'
export { default as caseCmd } from './case.js'
export { default as cases } from './cases.js'
export { default as history } from './history.js'
