import fs from 'fs';
import path from 'path';
import { errorLog, infoLog, debugLog } from '../general/log';
import Command from '../../models/Command';

export async function loadCommandsFromDir(directoryPath: string): Promise<Command[]> {
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

        // Determine environment (prod = js, dev = ts)
        const isProd = process.env.NODE_ENV === 'production';
        const fileExt = isProd ? '.js' : '.ts';

        // Get all relevant files in the directory
        const commandFiles = fs.readdirSync(absolutePath)
            .filter(file => file.endsWith(fileExt) && !file.startsWith('index.'));

        debugLog({ message: `Found ${commandFiles.length} command files in ${absolutePath}` });

        // Load commands using dynamic import
        const commands: Command[] = [];
        for (const file of commandFiles) {
            try {
                const filePath = path.join(absolutePath, file);
                debugLog({ message: `Loading command from: ${filePath}` });
                let commandModule;
                if (isProd) {
                    // Use file:// URL for ESM dynamic import in production
                    const fileUrl = `file://${filePath}`;
                    commandModule = await import(fileUrl);
                } else {
                    // Use regular import in dev
                    commandModule = await import(filePath);
                }
                const command = commandModule.default || commandModule.command;
                if (
                  command &&
                  typeof command === 'object' &&
                  typeof command.data === 'object' &&
                  typeof command.execute === 'function'
                ) {
                    debugLog({ message: `Successfully loaded command: ${command.data.name} from ${file}` });
                    commands.push(command);
                } else {
                    errorLog({ message: `Command in ${file} is not a valid Command instance` });
                }
            } catch (error) {
                errorLog({ message: `Error loading command from ${file}:`, error });
            }
        }

        infoLog({ message: `Successfully loaded ${commands.length} commands from ${absolutePath}` });
        return commands;
    } catch (error) {
        errorLog({ message: 'Error getting commands from directory:', error });
        return [];
    }
} 