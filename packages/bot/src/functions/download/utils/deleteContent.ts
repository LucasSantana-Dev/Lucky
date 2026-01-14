import fs from 'fs'
import { promisify } from 'util'
import { errorLog, successLog } from '@lukbot/shared/utils'

const unlinkAsync = promisify(fs.unlink)

export const deleteContent = async (path: string): Promise<void> => {
    try {
        await unlinkAsync(path)
        successLog({ message: `Successfully deleted ${path}` })
    } catch (error) {
        errorLog({ message: `Error deleting ${path}:`, error })
    }
}
