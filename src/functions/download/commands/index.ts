import { getCommandsFromDirectory } from '../../../utils/command/getCommandsFromDirectory';
import path from 'path';
import { fileURLToPath } from 'url';
import { infoLog, debugLog } from '../../../utils/general/log';
import { config } from '../../../config/config';

function normalizePath(p: string) {
  // Remove leading slash on Windows (e.g., /D:/...)
  if (process.platform === 'win32' && p.startsWith('/')) {
    return p.slice(1);
  }
  return p;
}

async function getDownloadCommands() {
  try {
    debugLog({ message: 'Loading download commands...' });
    const { COMMAND_CATEGORIES_DISABLED } = config();
    if (COMMAND_CATEGORIES_DISABLED.includes('download')) {
      infoLog({ message: 'Download command category is disabled via config.' });
      return [];
    }
    const isProd = process.env.NODE_ENV === 'production' || process.argv[1].includes('dist');
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const commandsPath = isProd
      ? path.join(process.cwd(), 'dist/functions/download/commands')
      : normalizePath(__dirname);
    debugLog({ message: `Loading download commands from path: ${commandsPath}` });
    const commands = await getCommandsFromDirectory({ url: commandsPath, category: 'download' });

    debugLog({ message: `Loaded ${commands.length} download commands` });
    return commands;
  } catch (error) {
    infoLog({ message: 'Error loading download commands:', error });
    return [];
  }
}

export default getDownloadCommands; 