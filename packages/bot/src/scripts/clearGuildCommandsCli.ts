import { errorLog } from '@lucky/shared/utils'
import { runClearGuildCommands } from './clearGuildCommands'

void runClearGuildCommands()
    .then((result) => {
        // Exit non-zero on partial success so a half-finished migration is not
        // mistaken for a completed one.
        process.exitCode = result.failed.length > 0 ? 1 : 0
    })
    .catch((error) => {
        errorLog({ message: 'clear-guild-commands failed', error })
        process.exitCode = 1
    })
