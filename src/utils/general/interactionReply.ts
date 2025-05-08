import {
  Interaction,
  ChatInputCommandInteraction,
  ButtonInteraction,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
  UserSelectMenuInteraction,
  ChannelSelectMenuInteraction,
  RoleSelectMenuInteraction,
  MentionableSelectMenuInteraction,
  InteractionReplyOptions as DjsInteractionReplyOptions
} from 'discord.js';
import { errorLog, debugLog } from './log';
import { errorEmbed, infoEmbed } from './embeds';

// Type for interactions that support reply methods
export type ReplyableInteraction =
  | ChatInputCommandInteraction
  | ButtonInteraction
  | ModalSubmitInteraction
  | StringSelectMenuInteraction
  | UserSelectMenuInteraction
  | ChannelSelectMenuInteraction
  | RoleSelectMenuInteraction
  | MentionableSelectMenuInteraction;

interface InteractionReplyOptions {
  interaction: Interaction;
  content: Omit<DjsInteractionReplyOptions, 'flags'> & { ephemeral?: boolean };
}

function stripFlags<T extends object>(obj: T): Omit<T, 'flags'> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { flags, ...rest } = obj as any;
  return rest;
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

    // Always defer if not already deferred or replied
    if ('isChatInputCommand' in interaction && interaction.isChatInputCommand()) {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: content.ephemeral ?? false });
      }
      if (interaction.replied) {
        await interaction.followUp(stripFlags(content));
      } else {
        await interaction.editReply(stripFlags(content));
      }
    } else {
      if (!interaction.deferred && !interaction.replied) {
        await interaction.deferReply({ ephemeral: content.ephemeral ?? false });
      }
      if (interaction.replied) {
        await interaction.followUp(stripFlags(content));
      } else {
        await interaction.editReply(stripFlags(content));
      }
    }
  } catch (error) {
    errorLog({ message: 'Error sending interaction reply:', error });
  }
};

function isReplyableInteraction(interaction: Interaction): interaction is ReplyableInteraction {
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
} 