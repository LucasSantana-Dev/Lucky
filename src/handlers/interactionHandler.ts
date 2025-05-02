import { 
  ChatInputCommandInteraction, 
  CommandInteractionOptionResolver, 
  Events, 
  Interaction,
  ButtonInteraction,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
  UserSelectMenuInteraction,
  ChannelSelectMenuInteraction,
  RoleSelectMenuInteraction,
  MentionableSelectMenuInteraction,
  InteractionType,
  EmbedBuilder
} from 'discord.js';
import { errorLog, debugLog } from '../utils/general/log';
import { executeCommand } from './commandsHandler';
import { CustomClient } from '../types';
import { errorEmbed, infoEmbed } from '../utils/general/embeds';
import { messages } from '../utils/general/messages';

interface HandleInteractionsParams {
  client: CustomClient;
}

interface InteractionGetOptionParams {
  interaction: ChatInputCommandInteraction;
  optionName: string;
}

interface InteractionGetSubcommandParams {
  interaction: ChatInputCommandInteraction;
}

// Type for interactions that support reply methods
type ReplyableInteraction = 
  | ChatInputCommandInteraction 
  | ButtonInteraction 
  | ModalSubmitInteraction 
  | StringSelectMenuInteraction 
  | UserSelectMenuInteraction 
  | ChannelSelectMenuInteraction 
  | RoleSelectMenuInteraction 
  | MentionableSelectMenuInteraction;

// Helper to check if interaction supports reply methods
const isReplyableInteraction = (interaction: Interaction): interaction is ReplyableInteraction => {
  return (
    interaction.isChatInputCommand() ||
    interaction.isButton() ||
    interaction.isModalSubmit() ||
    interaction.isStringSelectMenu() ||
    interaction.isUserSelectMenu() ||
    interaction.isChannelSelectMenu() ||
    interaction.isRoleSelectMenu() ||
    interaction.isMentionableSelectMenu()
  );
};

// Cache for interaction handlers to avoid recreating them
const interactionHandlers = new Map<InteractionType, (interaction: Interaction) => Promise<void>>();

export const handleInteractions = async ({ client }: HandleInteractionsParams): Promise<void> => {
  try {
    // Set up a single event listener for all interactions
    client.on(Events.InteractionCreate, async (interaction: Interaction) => {
      try {
        // Use cached handler if available, otherwise create a new one
        const handlerKey = interaction.type;
        let handler = interactionHandlers.get(handlerKey);
        
        if (!handler) {
          handler = async (interaction: Interaction) => {
            if (interaction.isChatInputCommand()) {
              await handleInteraction(interaction, client);
            }
          };
          interactionHandlers.set(handlerKey, handler);
        }
        
        await handler(interaction);
      } catch (error) {
        errorLog({ message: 'Error handling interaction:', error });
        // Don't try to respond to the interaction here, as it might already be handled
      }
    });
    
    debugLog({ message: 'Interaction handler set up successfully' });
  } catch (error) {
    errorLog({ message: 'Error setting up interaction handler:', error });
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

export async function handleInteraction(interaction: Interaction, client: CustomClient): Promise<void> {
  try {
    if (interaction.isChatInputCommand()) {
      await executeCommand({ interaction, client });
    }
  } catch (error) {
    errorLog({ message: 'Error handling interaction:', error });
    try {
      if (interaction.isChatInputCommand() && !interaction.replied && !interaction.deferred) {
        await interactionReply({
          interaction,
          content: {
            embeds: [errorEmbed('Erro', messages.error.generic)],
            ephemeral: true
          }
        });
      }
    } catch (error) {
      errorLog({ message: 'Error sending error message:', error });
    }
  }
} 