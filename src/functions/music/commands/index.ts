import path from 'path';
import { getCommandsFromDirectory } from '@utils/getCommandsFromDirectory';
import { infoLog, debugLog } from '@utils/log';
import { getDirname } from '@utils/pathUtils';

async function getMusicCommands() {
  try {
    debugLog({ message: 'Loading music commands...' });
    const commandsPath = path.resolve(getDirname(import.meta.url));
    const commands = await getCommandsFromDirectory({ url: commandsPath });

    debugLog({ message: `Loaded ${commands.length} music commands` });
    return commands;
  } catch (error) {
    console.log(error);
    infoLog({ message: 'Error loading music commands:', error });
    return [];
  }
}

export default getMusicCommands(); 