import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname } from 'path';
import { errorLog } from './log.js';

export const getCommandsFromDirectory = async ({ url }) => {
  try {
    const callerFilename = fileURLToPath(url);
    const callerDirname = dirname(callerFilename);

    const commandFiles = fs.readdirSync(callerDirname).filter(file => file.endsWith('.js'));

    const commands = [];

    const filteredCommandFiles = commandFiles.filter((file) => file !== 'index.js')

    for (const file of filteredCommandFiles) {
      if (file === 'index.js') continue; // Skip the index.js file
      const filePath = path.join(callerDirname, file);
      const command = await import(pathToFileURL(filePath));
      commands.push(command.default);
    }

    return commands;
  } catch (error) {
    errorLog({ message: 'Error getting commands from directory:', error });
  }
}
