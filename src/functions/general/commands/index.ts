import path from 'path';
import { getCommandsFromDirectory } from '@utils/getCommandsFromDirectory';
import { infoLog, debugLog } from '@utils/log';
import { getDirname } from '@utils/pathUtils';

async function getGeneralCommands() {
  try {
    debugLog({ message: 'Loading general commands...' });
    const commandsPath = path.resolve(getDirname(import.meta.url));
    const commands = await getCommandsFromDirectory({ url: commandsPath });

    debugLog({ message: `Loaded ${commands.length} general commands` });
    return commands;
  } catch (error) {
    infoLog({ message: 'Error loading general commands:', error });
    return [];
  }
}

export default getGeneralCommands(); 