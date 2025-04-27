import { getCommandsFromDirectory } from '../../../utils/getCommandsFromDirectory';
import path from 'path';
import { infoLog, debugLog } from '../../../utils/log';
async function getMusicCommands() {
    try {
        debugLog({ message: 'Loading music commands...' });
        const commandsPath = path.resolve(__dirname);
        const commands = await getCommandsFromDirectory({ url: commandsPath });
        debugLog({ message: `Loaded ${commands.length} music commands` });
        return commands;
    }
    catch (error) {
        infoLog({ message: 'Error loading music commands:', error });
        return [];
    }
}
export default getMusicCommands();
//# sourceMappingURL=index.js.map