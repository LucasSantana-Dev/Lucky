import { getCommandsFromDirectory } from '../../../utils/command/getCommandsFromDirectory'
import path from 'path'
import { fileURLToPath } from 'url'
import { debugLog, errorLog } from '../../../utils/general/log'
import { normalizePath } from '../../../utils/misc/pathUtils'

async function getDownloadCommands() {
    try {
        debugLog({ message: 'Loading download commands...' })
        const isProd =
            process.env.NODE_ENV === 'production' ||
            process.argv[1].includes('dist')
        const dirName = path.dirname(fileURLToPath(import.meta.url))
        const commandsPath = isProd
            ? path.join(process.cwd(), 'dist/functions/download/commands')
            : normalizePath(dirName)
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
