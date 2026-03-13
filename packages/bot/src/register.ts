import downloadCommands from './functions/download/commands/index'
import generalCommands from './functions/general/commands/index'
import { groupCommands } from './handlers/commandsHandler'
import musicCommands from './functions/music/commands/index'
import automodCommands from './functions/automod/commands/index'
import managementCommands from './functions/management/commands/index'
import moderationCommands from './functions/moderation/commands/index'
import { errorLog, debugLog } from '@lucky/shared/utils'
import type Command from './models/Command'

export const getCommands = async (): Promise<Command[]> => {
    try {
        debugLog({ message: 'Starting to load commands from all categories' })

        const [
            downloadCommandsList,
            generalCommandsList,
            musicCommandsList,
            automodCommandsList,
            managementCommandsList,
            moderationCommandsList,
        ] =
            await Promise.all([
                downloadCommands(),
                generalCommands(),
                musicCommands(),
                automodCommands(),
                managementCommands(),
                moderationCommands(),
            ])

        const allCommands = [
            ...downloadCommandsList,
            ...generalCommandsList,
            ...musicCommandsList,
            ...automodCommandsList,
            ...managementCommandsList,
            ...moderationCommandsList,
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
