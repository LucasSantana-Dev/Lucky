import downloadCommands from '../functions/download/commands/index';
import generalCommands from '../functions/general/commands/index';
import { groupCommands } from '../handlers/commandsHandler';
import musicCommands from '../functions/music/commands/index';
import { errorLog, infoLog, debugLog } from './log';
import Command from '../models/Command';

// Export a function that returns a promise of commands
export const getCommands = async (): Promise<Command[]> => {
  try {    
    debugLog({ message: 'Starting to load commands from all categories' });
    
    // Load commands from each category in parallel
    const [downloadCommandsList, generalCommandsList, musicCommandsList] = await Promise.all([
      downloadCommands,
      generalCommands,
      musicCommands
    ]);

    debugLog({ 
      message: `Loaded commands: ${downloadCommandsList.length} download, ${generalCommandsList.length} general, ${musicCommandsList.length} music` 
    });

    // Combine all commands
    const allCommands = [
      ...downloadCommandsList,
      ...generalCommandsList,
      ...musicCommandsList
    ];
    
    // Group commands by category
    const groupedCommands = groupCommands({
      commands: allCommands
    });
    
    infoLog({ message: `Successfully loaded ${groupedCommands.length} commands` });
    return groupedCommands;
  } catch (error) {
    errorLog({ message: 'Error loading commands:', error });
    return [];
  }
};

// For backward compatibility
const commands = getCommands();
export default commands; 