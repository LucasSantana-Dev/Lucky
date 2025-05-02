import fs from 'fs';
import path from 'path';
import { errorLog, infoLog, debugLog } from '../general/log';
import Command from '../../models/Command';
import { config } from '../../config/config';

interface GetCommandsParams {
  url: string;
  category?: string;
}

export const getCommandsFromDirectory = async ({ url, category }: GetCommandsParams): Promise<Command[]> => {
  try {        
    debugLog({ message: `Reading directory: ${url}` });
    
    // Defensive: If category is disabled, return [] immediately
    if (category) {
      const { COMMAND_CATEGORIES_DISABLED } = config();
      if (COMMAND_CATEGORIES_DISABLED.includes(category)) {
        debugLog({ message: `Category '${category}' is disabled via config. Skipping load.` });
        return [];
      }
    }
    
    // Ensure the path is absolute
    const absolutePath = path.isAbsolute(url) ? url : path.resolve(url);
    debugLog({ message: `Absolute path: ${absolutePath}` });
    
    // Check if directory exists
    if (!fs.existsSync(absolutePath)) {
      errorLog({ message: `Directory does not exist: ${absolutePath}` });
      return [];
    }
    
    // Get all JavaScript or TypeScript files in the directory (support dev and prod)
    const commandFiles = fs.readdirSync(absolutePath)
      .filter(file => file.endsWith('.js') || file.endsWith('.ts'));

    debugLog({ message: `Found ${commandFiles.length} command files in ${absolutePath}` });
    
    // Filter out index files (index.ts, index.js, etc.)
    const filteredCommandFiles = commandFiles.filter(file => !file.startsWith('index.'));

    debugLog({ message: `Filtered to ${filteredCommandFiles.length} command files (excluding index files)` });

    // Load commands using dynamic imports
    const commands: Command[] = [];
    for (const file of filteredCommandFiles) {
      try {
        const filePath = path.join(absolutePath, file);
        debugLog({ message: `Loading command from: ${filePath}` });
        
        // Convert file path to URL for dynamic import
        const fileUrl = `file://${filePath}`;
        
        // Use dynamic import for ESM modules
        const commandModule = await import(fileUrl);
        
        // Try to get the command from either default export or named export
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
    // Filter out disabled commands by name
    const { COMMANDS_DISABLED } = config();
    const filteredCommands = commands.filter(cmd => !COMMANDS_DISABLED.includes(cmd.data.name));
    if (filteredCommands.length !== commands.length) {
      debugLog({ message: `Filtered out ${commands.length - filteredCommands.length} disabled commands from ${absolutePath}` });
    }
    return filteredCommands;
  } catch (error) {
    errorLog({ message: 'Error getting commands from directory:', error });
    return [];
  }
}; 