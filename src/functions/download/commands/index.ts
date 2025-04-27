import { getCommandsFromDirectory } from '../../../utils/getCommandsFromDirectory';
import path from 'path';
import { infoLog, debugLog } from '../../../utils/log';
import { getDirname } from '../../../utils/pathUtils';

async function getDownloadCommands() {
  try {
    debugLog({ message: 'Loading download commands...' });
    const commandsPath = path.resolve(getDirname(import.meta.url));
    const commands = await getCommandsFromDirectory({ url: commandsPath });

    debugLog({ message: `Loaded ${commands.length} download commands` });
    return commands;
  } catch (error) {
    infoLog({ message: 'Error loading download commands:', error });
    return [];
  }
}

export default getDownloadCommands(); 