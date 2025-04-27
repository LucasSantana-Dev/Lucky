import fs from 'fs';
import path from 'path';
import { errorLog, infoLog, debugLog } from './log';
import Command from '../models/Command';
export async function loadCommandsFromDir(directoryPath) {
    try {
        debugLog({ message: `Reading directory: ${directoryPath}` });
        // Ensure the path is absolute
        const absolutePath = path.isAbsolute(directoryPath) ? directoryPath : path.resolve(directoryPath);
        debugLog({ message: `Absolute path: ${absolutePath}` });
        // Check if directory exists
        if (!fs.existsSync(absolutePath)) {
            errorLog({ message: `Directory does not exist: ${absolutePath}` });
            return [];
        }
        // Get all TypeScript files in the directory
        const commandFiles = fs.readdirSync(absolutePath)
            .filter(file => file.endsWith('.ts') || file.endsWith('.js'));
        debugLog({ message: `Found ${commandFiles.length} command files in ${absolutePath}` });
        // Filter out index files
        const filteredCommandFiles = commandFiles.filter(file => file !== 'index.ts' && file !== 'index.js');
        debugLog({ message: `Filtered to ${filteredCommandFiles.length} command files (excluding index files)` });
        // Load commands using require
        const commands = [];
        for (const file of filteredCommandFiles) {
            try {
                const filePath = path.join(absolutePath, file);
                debugLog({ message: `Loading command from: ${filePath}` });
                // Use require for CommonJS modules
                const commandModule = require(filePath);
                // Try to get the command from either default export or named export
                const command = commandModule.default || commandModule.command;
                if (command instanceof Command) {
                    debugLog({ message: `Successfully loaded command: ${command.data.name} from ${file}` });
                    commands.push(command);
                }
                else {
                    errorLog({ message: `Command in ${file} is not a valid Command instance` });
                }
            }
            catch (error) {
                errorLog({ message: `Error loading command from ${file}:`, error });
            }
        }
        infoLog({ message: `Successfully loaded ${commands.length} commands from ${absolutePath}` });
        return commands;
    }
    catch (error) {
        errorLog({ message: 'Error getting commands from directory:', error });
        return [];
    }
}
//# sourceMappingURL=commandLoader.js.map