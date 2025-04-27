import fs from 'fs';
import { promisify } from 'util';
import { errorLog, successLog } from '../../../utils/log';
const unlinkAsync = promisify(fs.unlink);
export const deleteContent = async (path) => {
    try {
        await unlinkAsync(path);
        successLog({ message: `Successfully deleted ${path}` });
    }
    catch (error) {
        errorLog({ message: `Error deleting ${path}:`, error });
    }
};
//# sourceMappingURL=deleteContent.js.map