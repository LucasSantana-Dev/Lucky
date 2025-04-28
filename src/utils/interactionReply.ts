import { Interaction } from 'discord.js';
import { errorLog, debugLog } from './log';
import { errorEmbed, infoEmbed } from './embeds';

// Type for interactions that support reply methods
type ReplyableInteraction = 
  | Interaction & { isChatInputCommand(): boolean; reply(content: any): Promise<any>; followUp(content: any): Promise<any>; editReply(content: any): Promise<any>; replied: boolean; deferred: boolean; }
  | Interaction & { isButton(): boolean; reply(content: any): Promise<any>; }
  | Interaction & { isModalSubmit(): boolean; reply(content: any): Promise<any>; }
  | Interaction & { isStringSelectMenu(): boolean; reply(content: any): Promise<any>; }
  | Interaction & { isUserSelectMenu(): boolean; reply(content: any): Promise<any>; }
  | Interaction & { isChannelSelectMenu(): boolean; reply(content: any): Promise<any>; }
  | Interaction & { isRoleSelectMenu(): boolean; reply(content: any): Promise<any>; }
  | Interaction & { isMentionableSelectMenu(): boolean; reply(content: any): Promise<any>; };

// Helper to check if interaction supports reply methods
const isReplyableInteraction = (interaction: Interaction): interaction is ReplyableInteraction => {
  return (
    'isChatInputCommand' in interaction && interaction.isChatInputCommand() ||
    'isButton' in interaction && interaction.isButton() ||
    'isModalSubmit' in interaction && interaction.isModalSubmit() ||
    'isStringSelectMenu' in interaction && interaction.isStringSelectMenu() ||
    'isUserSelectMenu' in interaction && interaction.isUserSelectMenu() ||
    'isChannelSelectMenu' in interaction && interaction.isChannelSelectMenu() ||
    'isRoleSelectMenu' in interaction && interaction.isRoleSelectMenu() ||
    'isMentionableSelectMenu' in interaction && interaction.isMentionableSelectMenu()
  );
};

interface InteractionReplyOptions {
  interaction: Interaction;
  content: {
    content?: string;
    ephemeral?: boolean;
    embeds?: any[];
  };
}

export const interactionReply = async ({ interaction, content }: InteractionReplyOptions): Promise<void> => {
  try {
    if (!isReplyableInteraction(interaction)) {
      debugLog({ message: 'Interaction does not support reply methods' });
      return;
    }

    // Convert plain text content to embed if no embeds are provided
    if (content.content && (!content.embeds || content.embeds.length === 0)) {
      // Create appropriate embed based on content
      const embed = content.content.toLowerCase().includes('erro') 
        ? errorEmbed('Erro', content.content)
        : infoEmbed('Informação', content.content);
      
      content.embeds = [embed];
      content.content = ''; // Clear the content since we're using an embed
    }

    if ('isChatInputCommand' in interaction && interaction.isChatInputCommand()) {
      if (interaction.replied) {
        await interaction.followUp(content);
      } else if (interaction.deferred) {
        await interaction.editReply(content);
      } else {
        await interaction.reply(content);
      }
    } else {
      await interaction.reply(content);
    }
  } catch (error) {
    errorLog({ message: 'Error sending interaction reply:', error });
  }
}; 