import { Collection, ChatInputCommandInteraction } from 'discord.js';
import { errorLog, infoLog, debugLog } from '../utils/general/log';
import { CustomClient } from '../types';
import Command from '../models/Command';
import { interactionReply } from '../utils/general/interactionReply';
import { messages } from '../utils/general/messages';

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

export const executeCommand = async ({ interaction, client }: ExecuteCommandParams): Promise<void> => {
  try {
    const command = client.commands.get(interaction.commandName);
    if (!command) {
      debugLog({ message: `Command not found: ${interaction.commandName}` });
      return;
    }

    debugLog({ message: `Executing command: ${interaction.commandName}` });
    await command.execute({ interaction, client });
  } catch (error) {
    errorLog({ message: `Error executing command ${interaction.commandName}:`, error });
    try {
      await interactionReply({
        interaction,
        content: {
          content: messages.error.generic,
          ephemeral: true
        }
      });
    } catch (error) {
      errorLog({ message: 'Error sending error message:', error });
    }
  }
};

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