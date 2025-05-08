import { Collection } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { CustomClient } from '../../types';
import { errorLog, infoLog, debugLog } from '../general/log';
import Command from '../../models/Command';
import { groupCommands, setCommands } from '../../handlers/commandsHandler';

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
        
        // Get all JavaScript files in the directory (ignore .d.ts and other files)
        const commandFiles = fs.readdirSync(absolutePath)
            .filter(file => file.endsWith('.js'));

        debugLog({ message: `Found ${commandFiles.length} command files in ${absolutePath}` });
        
        // Filter out index files
        const filteredCommandFiles = commandFiles.filter(file => 
            file !== 'index.js' && file !== 'index'
        );

        debugLog({ message: `Filtered to ${filteredCommandFiles.length} command files (excluding index files)` });

        // Load commands synchronously
        const commands: Command[] = [];
        for (const file of filteredCommandFiles) {
            try {
                const filePath = path.join(absolutePath, file);
                debugLog({ message: `Loading command from: ${filePath}` });
                
                // Pre-import log
                console.error('About to import:', filePath);
                // Use dynamic import for both TypeScript and JavaScript files
                const commandModule = await import(filePath);
                // Debug logging
                console.error('Imported command module:', commandModule);
                const command = commandModule.default || commandModule.command;
                console.error('Extracted command:', command);
                
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
                console.error('Error details:', error);
            }
        }

        infoLog({ message: `