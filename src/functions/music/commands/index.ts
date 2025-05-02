import { getCommandsFromDirectory } from '../../../utils/command/getCommandsFromDirectory';
import path from 'path';
import { fileURLToPath } from 'url';
import { infoLog, debugLog } from '../../../utils/general/log';

function normalizePath(p: string) {
  // Remove leading slash on Windows (e.g., /D:/...)
  if (process.platform === 'win32' && p.startsWith('/')) {
    return p.slice(1);
  }
  return p;
}

async function getMusicCommands() {
  try {
    debugLog({ message: 'Loading music commands...' });
    const isProd = process.env.NODE_ENV === 'production' || process.argv[1].includes('dist');
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const commandsPath = isProd
      ? path.join(process.cwd(), 'dist/functions/music/commands')
      : normalizePath(__dirname);
    const commands = await getCommandsFromDirectory({ url: commandsPath, category: 'music' });

    debugLog({ message: `Loaded ${commands.length} music commands` });
    return commands;
  } catch (error) {
    console.log(error);
    infoLog({ message: 'Error loading music commands:', error });
    return [];
  }
}

export default getMusicCommands; 