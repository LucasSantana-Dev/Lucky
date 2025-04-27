import { getCommandsFromDirectory } from '../../../utils/getCommandsFromDirectory';
import path from 'path';
import { infoLog, debugLog } from '../../../utils/log';
async function getGeneralCommands() {
    try {
        debugLog({ message: 'Loading general commands...' });
        const commandsPath = path.resolve(__dirname);
        const commands = await getCommandsFromDirectory({ url: commandsPath });
        debugLog({ message: `Loaded ${commands.length} general commands` });
        return commands;
    }
    catch (error) {
        infoLog({ message: 'Error loading general commands:', error });
        return [];
    }
}
export default getGeneralCommands();
//# sourceMappingURL=index.js.map