import { ChatInputCommandInteraction, VoiceChannel, GuildMember } from 'discord.js';
import { GuildQueue } from 'discord-player';
import { CustomClient } from '../types/index';

interface CreateQueueParams {
  client: CustomClient;
  interaction: ChatInputCommandInteraction;
}

interface QueueConnectParams {
  queue: GuildQueue;
  interaction: ChatInputCommandInteraction;
}

export const createQueue = async ({ client, interaction }: CreateQueueParams): Promise<GuildQueue> => {
  return client.player.nodes.create(interaction.guild!);
};

export const queueConnect = async ({ queue, interaction }: QueueConnectParams): Promise<void> => {
  if (queue.connection) return;
  await queue.connect((interaction.member as GuildMember)?.voice.channel as VoiceChannel);
}; 