import fs from 'fs';
import { errorLog, successLog } from '../../../utils/log';

export const deleteContent = async (path) => {
  try {
    await fs.unlink(path, (err) => {
      if (err) {
        throw new Error(err);
      } else {
        successLog(`Successfully deleted ${path}`);
      }
    });
  } catch (err) {
    errorLog(`Error deleting ${path}:`, err);
  }
}