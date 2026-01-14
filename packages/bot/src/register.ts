import downloadCommands from './functions/download/commands/index'
import generalCommands from './functions/general/commands/index'
import { groupCommands } from './handlers/commandsHandler'
import musicCommands from './functions/music/commands/index'
import { errorLog, debugLog } from '@lukbot/shared/utils'
import type Command from './models/Command'

export const getCommands = async (): Promise<Command[]> => {
    try {
        debugLog({ message: 'Starting to load commands from all categories' })

        const [downloadCommandsList, generalCommandsList, musicCommandsList] =
            await Promise.all([
                downloadCommands(),
                generalCommands(),
                musicCommands(),
            ])

        const allCommands = [
            ...downloadCommandsList,
            ...generalCommandsList,
            ...musicCommandsList,
        ]

        const groupedCommands = groupCommands({
            commands: allCommands as Command[],
        })

        return groupedCommands
    } catch (error) {
        errorLog({ message: 'Error loading commands:', error })
        return []
    }
}
