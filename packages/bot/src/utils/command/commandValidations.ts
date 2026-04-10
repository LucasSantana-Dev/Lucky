import type { ChatInputCommandInteraction, GuildMember } from 'discord.js'
import { GuildMemberRoleManager, PermissionsBitField, PermissionFlagsBits } from 'discord.js'
import type { GuildQueue } from 'discord-player'
import { errorEmbed, createErrorEmbed } from '../general/embeds'
import { interactionReply } from '../general/interactionReply'
import {
    handleError,
    createUserErrorMessage,
    warnLog,
} from '@lucky/shared/utils'
import { guildSettingsService } from '@lucky/shared/services'

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
        warnLog({
            message: 'requireVoiceChannel: user not in voice channel',
            data: {
                commandName: interaction.commandName,
                userId: interaction.user.id,
                guildId: interaction.guildId ?? undefined,
            },
        })

        await interactionReply({
            interaction,
            content: {
                embeds: [
                    errorEmbed('Not in Voice', 'Join a voice channel first.'),
                ],
                ephemeral: true,
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
        warnLog({
            message: 'requireQueue: no active queue',
            data: {
                commandName: interaction.commandName,
                userId: interaction.user.id,
                guildId: interaction.guildId ?? undefined,
            },
        })

        await interactionReply({
            interaction,
            content: {
                embeds: [
                    errorEmbed(
                        'No Queue',
                        'No music is playing. Use /play to start.',
                    ),
                ],
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
        warnLog({
            message: 'requireCurrentTrack: no current track',
            data: {
                commandName: interaction.commandName,
                userId: interaction.user.id,
                guildId: interaction.guildId ?? undefined,
            },
        })

        await interactionReply({
            interaction,
            content: {
                embeds: [
                    errorEmbed('Not Playing', 'No track is currently playing.'),
                ],
                ephemeral: true,
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
        warnLog({
            message: 'requireIsPlaying: not playing',
            data: {
                commandName: interaction.commandName,
                userId: interaction.user.id,
                guildId: interaction.guildId ?? undefined,
            },
        })

        await interactionReply({
            interaction,
            content: {
                embeds: [
                    errorEmbed('Not Playing', 'No music is currently playing.'),
                ],
                ephemeral: true,
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

export async function requireDJRole(
    interaction: ChatInputCommandInteraction,
    guildId: string,
): Promise<boolean> {
    const member = interaction.member as GuildMember | null
    if (!member) return true

    if (
        member.permissions instanceof PermissionsBitField &&
        member.permissions.has(PermissionFlagsBits.ManageGuild)
    ) {
        return true
    }

    const settings = await guildSettingsService.getGuildSettings(guildId)
    if (!settings?.djRoleId) return true

    const hasDJRole =
        member.roles instanceof GuildMemberRoleManager
            ? member.roles.cache.has(settings.djRoleId)
            : false

    if (!hasDJRole) {
        await interactionReply({
            interaction,
            content: {
                embeds: [
                    createErrorEmbed(
                        'DJ Only',
                        'This command is restricted to members with the DJ role.',
                    ),
                ],
                ephemeral: true,
            },
        })
    }
    return hasDJRole
}