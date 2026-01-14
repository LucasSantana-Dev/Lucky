import type { ChatInputCommandInteraction, GuildMember } from 'discord.js'
import type { GuildQueue } from 'discord-player'
import { errorEmbed } from '../general/embeds'
import { interactionReply } from '../general/interactionReply'
import {
    handleError,
    createUserErrorMessage,
} from '@lukbot/shared/utils'

export async function requireGuild(
    interaction: ChatInputCommandInteraction,
): Promise<boolean> {
    if (!interaction.guildId) {
        const error = handleError(
            new Error('Command can only be used in a guild/server'),
            {
                guildId: interaction.guildId ?? undefined,
                userId: interaction.user.id,
            },
        )

        await interactionReply({
            interaction,
            content: {
                embeds: [errorEmbed('Error', createUserErrorMessage(error))],
            },
        })
        return false
    }
    return true
}

export async function requireVoiceChannel(
    interaction: ChatInputCommandInteraction,
): Promise<boolean> {
    const member = interaction.member as GuildMember
    if (!member?.voice?.channel) {
        const error = handleError(
            new Error('User must be in a voice channel'),
            {
                guildId: interaction.guildId ?? undefined,
                userId: interaction.user.id,
            },
        )

        await interactionReply({
            interaction,
            content: {
                embeds: [errorEmbed('Error', createUserErrorMessage(error))],
            },
        })
        return false
    }
    return true
}

export async function requireQueue(
    queue: GuildQueue | null,
    interaction: ChatInputCommandInteraction,
): Promise<boolean> {
    if (!queue) {
        const error = handleError(new Error('No music queue found'), {
            guildId: interaction.guildId ?? undefined,
            userId: interaction.user.id,
        })

        await interactionReply({
            interaction,
            content: {
                embeds: [errorEmbed('Error', createUserErrorMessage(error))],
            },
        })
        return false
    }
    return true
}

export async function requireCurrentTrack(
    queue: GuildQueue | null,
    interaction: ChatInputCommandInteraction,
): Promise<boolean> {
    if (!queue?.currentTrack) {
        const error = handleError(new Error('No track is currently playing'), {
            guildId: interaction.guildId ?? undefined,
            userId: interaction.user.id,
        })

        await interactionReply({
            interaction,
            content: {
                embeds: [errorEmbed('Error', createUserErrorMessage(error))],
            },
        })
        return false
    }
    return true
}

export async function requireIsPlaying(
    queue: GuildQueue | null,
    interaction: ChatInputCommandInteraction,
): Promise<boolean> {
    if (!queue?.isPlaying()) {
        const error = handleError(new Error('No music is currently playing'), {
            guildId: interaction.guildId ?? undefined,
            userId: interaction.user.id,
        })

        await interactionReply({
            interaction,
            content: {
                embeds: [errorEmbed('Error', createUserErrorMessage(error))],
            },
        })
        return false
    }
    return true
}

export async function requireInteractionOptions(
    interaction: ChatInputCommandInteraction,
    options: string[],
) {
    if (!options.includes(interaction.options.getSubcommand() ?? '')) {
        const error = handleError(new Error('Invalid interaction option'), {
            guildId: interaction.guildId ?? undefined,
            userId: interaction.user.id,
        })

        await interactionReply({
            interaction,
            content: {
                embeds: [errorEmbed('Error', createUserErrorMessage(error))],
            },
        })
        return false
    }
    return true
}
