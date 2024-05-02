import fs from 'fs';

export const deleteContent = async (path) => {
  try {
    await fs.unlink(path, (err) => {
      if (err) {
        throw new Error(err);
      } else {
        console.log(`Successfully deleted ${path}`);
      }
    });
  } catch (err) {
    console.error(`Error deleting ${path}:`, err);
  }
}