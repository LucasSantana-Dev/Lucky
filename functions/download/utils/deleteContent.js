import fs from 'fs';
import { errorLog, successLog } from '../../../utils/log.js';

export const deleteContent = async (path) => {
  try {
    await fs.unlink(path, (err) => {
      if (err) {
        throw new Error(err);
      } else {
        successLog({ message: `Successfully deleted ${path}` });
      }
    });
  } catch (error) {
    errorLog({ message: `Error deleting ${path}:`, error });
  }
}