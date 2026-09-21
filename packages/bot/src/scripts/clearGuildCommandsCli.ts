import { errorLog } from '@lucky/shared/utils'
import { runClearGuildCommands } from './clearGuildCommands'

void runClearGuildCommands()
    .then((result) => {
        process.exitCode = result.failed.length > 0 ? 1 : 0
    })
    .catch((error) => {
        errorLog({ message: 'clear-guild-commands failed', error })
        process.exitCode = 1
    })
