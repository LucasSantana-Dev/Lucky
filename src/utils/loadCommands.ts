import { Collection } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { CustomClient } from '@/types';
import { errorLog, infoLog, debugLog } from '@utils/log';
import Command from '@models/Command';
import { groupCommands, setCommands } from '@handlers/commandsHandler';

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
        
        // Get all TypeScript files in the directory
        const commandFiles = fs.readdirSync(absolutePath)
            .filter(file => file.endsWith('.ts') || file.endsWith(''));

        debugLog({ message: `Found ${commandFiles.length} command files in ${absolutePath}` });
        
        // Filter out index files
        const filteredCommandFiles = commandFiles.filter(file => 
            file !== 'index.ts' && file !== 'index'
        );

        debugLog({ message: `Filtered to ${filteredCommandFiles.length} command files (excluding index files)` });

        // Load commands synchronously
        const commands: Command[] = [];
        for (const file of filteredCommandFiles) {
            try {
                const filePath = path.join(absolutePath, file);
                debugLog({ message: `Loading command from: ${filePath}` });
                
                // Use dynamic import for both TypeScript and JavaScript files
                const commandModule = await import(filePath);
                
                // Try to get the command from either default export or named export
                const command = commandModule.default || commandModule.command;
                
                if (command instanceof Command) {
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

export async function loadCommands(client: CustomClient): Promise<void> {
    try {
        infoLog({ message: 'Starting command loading process...' });

        // Initialize commands collection if it doesn't exist
        if (!client.commands) {
            client.commands = new Collection();
        }

        // Define command directories
        const commandDirs = [
            path.resolve(__dirname, '../functions/download/commands'),
            path.resolve(__dirname, '../functions/general/commands'),
            path.resolve(__dirname, '../functions/music/commands')
        ];

        // Load commands from each directory
        const allCommands: Command[] = [];
        
        for (const dir of commandDirs) {
            try {
                const commands = await loadCommandsFromDir(dir);
                allCommands.push(...commands);
            } catch (error) {
                errorLog({ message: `Error loading commands from directory ${dir}:`, error });
            }
        }

        infoLog({ message: `Found ${allCommands.length} total commands` });

        // Group commands by category
        const groupedCommands = groupCommands({
            commands: allCommands
        });

        // Set commands in the client's collection
        await setCommands({ client, commands: groupedCommands });

        // Log loaded commands
        for (const command of groupedCommands) {
            infoLog({ message: `Loaded command: ${command.data.name}` });
        }

        // Verify commands were loaded
        const commandCount = client.commands.size;
        infoLog({ message: `Successfully loaded ${commandCount} commands` });
    } catch (error) {
        errorLog({ message: 'Error loading commands:', error });
        throw error; // Re-throw to handle in the main process
    }
} 