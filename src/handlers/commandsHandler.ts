import { Collection, ChatInputCommandInteraction } from 'discord.js';
import { errorLog, infoLog, debugLog } from '../utils/log';
import { CustomClient } from '../types';
import Command from '../models/Command';

interface ExecuteCommandParams {
  interaction: ChatInputCommandInteraction;
  client: CustomClient;
}

interface SetCommandsParams {
  client: CustomClient;
  commands: Command[];
}

interface GroupCommandsParams {
  commands: Command[];
}

export async function executeCommand({ interaction, client }: ExecuteCommandParams): Promise<void> {
  try {
    const command = client.commands.get(interaction.commandName);
    
    if (!command) {
      errorLog({ message: `Command not found: ${interaction.commandName}` });
      await interaction.reply({ 
        content: 'This command no longer exists.',
        ephemeral: true 
      });
      return;
    }

    debugLog({ message: `Executing command: ${interaction.commandName}` });
    await command.execute({ interaction, client });
    
  } catch (error) {
    errorLog({ message: `Error executing command ${interaction.commandName}:`, error });
    const errorMessage = 'There was an error executing this command.';
    
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: errorMessage, ephemeral: true });
    } else {
      await interaction.reply({ content: errorMessage, ephemeral: true });
    }
  }
}

export async function setCommands({ client, commands }: SetCommandsParams): Promise<void> {
  try {
    infoLog({ message: 'Setting commands in client collection...' });
    
    client.commands = new Collection();
    
    for (const command of commands) {
      if (command.data.name) {
        client.commands.set(command.data.name, command);
      }
    }
    
    debugLog({ message: `Loaded ${client.commands.size} commands` });
  } catch (error) {
    errorLog({ message: 'Error setting commands:', error });
    throw error;
  }
}

export const groupCommands = ({ commands }: GroupCommandsParams): Command[] => {
  try {    
    // Filter out invalid commands
    const validCommands = commands.filter(cmd => {
      if (!cmd || !cmd.data || !cmd.data.name || !cmd.execute) {
        errorLog({ message: `Invalid command found during grouping: ${cmd?.data?.name || 'unknown'}` });
        return false;
      }
      return true;
    });

    return validCommands;
  } catch (error) {
    errorLog({ message: 'Error grouping commands:', error });
    return [];
  }
}; 