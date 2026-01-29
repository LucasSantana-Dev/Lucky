import { getCommandsFromDirectory } from '../../../utils/command/getCommandsFromDirectory'
import path from 'path'
import { fileURLToPath } from 'url'
import { debugLog, errorLog } from '@lukbot/shared/utils'
import { normalizePath } from '../../../utils/misc/pathUtils'

async function getMusicCommands() {
    try {
        debugLog({ message: 'Loading music commands...' })
        const isProd =
            process.env.NODE_ENV === 'production' ||
            process.argv[1].includes('dist')
        const dirName = path.dirname(fileURLToPath(import.meta.url))
        const commandsPath = isProd
            ? path.join(process.cwd(), 'dist/functions/music/commands')
            : normalizePath(dirName)
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
