import { ChatInputCommandInteraction, GuildMember } from 'discord.js';
import { GuildQueue } from 'discord-player';
import { errorEmbed } from '../general/embeds';
import { messages } from '../general/messages';
import { interactionReply } from '../general/interactionReply';

export async function requireGuild(interaction: ChatInputCommandInteraction): Promise<boolean> {
    if (!interaction.guildId) {
        await interactionReply({
            interaction,
            content: {
                embeds: [errorEmbed('Erro', messages.error.guildOnly)]
            }
        });
        return false;
    }
    return true;
}

export async function requireVoiceChannel(interaction: ChatInputCommandInteraction): Promise<boolean> {
    const member = interaction.member as GuildMember;
    if (!member?.voice?.channel) {
        await interactionReply({
            interaction,
            content: {
                embeds: [errorEmbed('Erro', messages.error.voiceChannel)]
            }
        });
        return false;
    }
    return true;
}

export async function requireQueue(queue: GuildQueue | null, interaction: ChatInputCommandInteraction): Promise<boolean> {
    if (!queue) {
        await interactionReply({
            interaction,
            content: {
                embeds: [errorEmbed('Erro', messages.error.noQueue)]
            }
        });
        return false;
    }
    return true;
}

export async function requireCurrentTrack(queue: GuildQueue | null, interaction: ChatInputCommandInteraction): Promise<boolean> {
    if (!queue?.currentTrack) {
        await interactionReply({
            interaction,
            content: {
                embeds: [errorEmbed('Erro', messages.error.noTrack)]
            }
        });
        return false;
    }
    return true;
}

export async function requireIsPlaying(queue: GuildQueue | null, interaction: ChatInputCommandInteraction): Promise<boolean> {
    if (!queue?.isPlaying()) {
        await interactionReply({
            interaction,
            content: {
                embeds: [errorEmbed('Erro', messages.error.notPlaying)]
            }
        });
        return false;
    }
    return true;
}

export async function requireInteractionOptions(interaction: ChatInputCommandInteraction, options: string[]) {
    if (!options.includes(interaction.options.getSubcommand())) {
        await interactionReply({
            interaction,
            content: {
                embeds: [errorEmbed('Erro', messages.error.invalidOption)]
            }
        });
        return false;
    }
    return true;
}