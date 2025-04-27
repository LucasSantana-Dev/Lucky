import { ChatInputCommandInteraction, CommandInteractionOptionResolver, Events, Interaction } from 'discord.js';
import { errorLog, debugLog } from '../utils/log';
import { executeCommand } from './commandsHandler';
import { CustomClient } from '../types';

interface HandleInteractionsParams {
  client: CustomClient;
}

interface InteractionReplyParams {
  interaction: ChatInputCommandInteraction;
  content: string | { content: string; ephemeral?: boolean };
}

interface InteractionGetOptionParams {
  interaction: ChatInputCommandInteraction;
  optionName: string;
}

interface InteractionGetSubcommandParams {
  interaction: ChatInputCommandInteraction;
}

export const handleInteractions = async ({ client }: HandleInteractionsParams): Promise<void> => {
  try {
    client.on(Events.InteractionCreate, async (interaction: Interaction) => {
      if (interaction.isChatInputCommand()) {
        await handleInteraction(interaction, client);
      }
    });
  } catch (error) {
    errorLog({ message: 'Error handling interaction:', error });
  }
};

export const interactionReply = async ({ interaction, content }: InteractionReplyParams): Promise<void> => {
  try {
    await interaction.reply(content);
  } catch (error) {
    errorLog({ message: 'Error replying to interaction:', error });
  }
};

export const interactionGetAllOptions = async ({ interaction }: { interaction: ChatInputCommandInteraction }): Promise<Omit<CommandInteractionOptionResolver, "getMessage" | "getFocused">> => {
  try {
    return interaction.options;
  } catch (error) {
    errorLog({ message: 'Error getting interaction options:', error });
    throw error;
  }
};

export const interactionGetOption = async ({ interaction, optionName }: InteractionGetOptionParams) => {
  try {
    return interaction.options.get(optionName);
  } catch (error) {
    errorLog({ message: 'Error getting interaction option:', error });
    throw error;
  }
};

export const interactionGetSubcommand = async ({ interaction }: InteractionGetSubcommandParams): Promise<string> => {
  try {
    return interaction.options.getSubcommand();
  } catch (error) {
    errorLog({ message: 'Error getting interaction subcommand:', error });
    throw error;
  }
};

export async function handleInteraction(interaction: ChatInputCommandInteraction, client: CustomClient): Promise<void> {
  try {
    debugLog({ message: `Processing command: ${interaction.commandName}` });
    await executeCommand({ interaction, client });
  } catch (error) {
    errorLog({ message: 'Error in interaction handler:', error });
    throw error; // Re-throw to be handled by the event handler
  }
} 